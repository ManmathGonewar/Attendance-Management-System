<?php

class ProfileController
{
    private PDO $pdo;
    private AuditService $audit;
    private SessionContext $sessionCtx;

    public function __construct(PDO $pdo, AuditService $audit, SessionContext $sessionCtx)
    {
        $this->pdo = $pdo;
        $this->audit = $audit;
        $this->sessionCtx = $sessionCtx;
    }

    public function get(): void
    {
        Session::requireAuth($this->sessionCtx);
        require_method('GET');

        $uid = (int)$this->sessionCtx->currentUser['id'];

        $stmt = $this->pdo->prepare(
            "SELECT u.unique_user_id, u.name, u.email, u.role, u.status, u.last_login,
                    COALESCE(u.profile_photo_data, u.profile_photo_path) AS profile_photo_url,
                    c.name AS college_name,
                    up.phone, up.hobbies, up.department_info,
                    s.student_id, s.course, s.year, s.semester, s.section,
                    d.name AS dept_name
             FROM users u
             LEFT JOIN colleges c ON c.id = u.college_id
             LEFT JOIN user_profiles up ON up.user_id = u.id
             LEFT JOIN students s ON s.user_id = u.id
             LEFT JOIN departments d ON d.id = s.dept_id
             WHERE u.id = :id
             LIMIT 1"
        );
        $stmt->execute([':id' => $uid]);
        $row = $stmt->fetch();
        if (!$row) {
            json_response(['success' => false, 'error' => 'Profile not found'], 404);
        }

        if (($row['role'] ?? '') === 'student' && ($row['student_id'] ?? null) === null) {
            json_response(['success' => false, 'error' => 'Student profile not found'], 404);
        }

        json_response([
            'success' => true,
            'profile' => [
                'unique_user_id' => $row['unique_user_id'],
                'name' => $row['name'],
                'email' => $row['email'],
                'role' => $row['role'],
                'status' => $row['status'],
                'college_name' => $row['college_name'],
                'last_login' => $row['last_login'],
                'profile_photo_url' => $row['profile_photo_url'],
                'phone' => $row['phone'] ?? null,
                'hobbies' => $row['hobbies'] ?? null,
                'department_info' => $row['department_info'] ?? null,
                'dept_name' => $row['dept_name'] ?? null,
                'course' => $row['course'] ?? null,
                'year' => ($row['year'] !== null) ? (int)$row['year'] : null,
                'semester' => ($row['semester'] !== null) ? (int)$row['semester'] : null,
                'section' => $row['section'] ?? null,
            ],
        ]);
    }

    public function update(): void
    {
        Session::requireAuth($this->sessionCtx);
        require_method('POST');
        $input = read_json_body();
        $name = trim((string)($input['name'] ?? ''));
        $email = trim((string)($input['email'] ?? ''));
        $phoneProvided = array_key_exists('phone', $input);
        $hobbiesProvided = array_key_exists('hobbies', $input);
        $departmentInfoProvided = array_key_exists('department_info', $input);

        $phone = $phoneProvided ? trim((string)($input['phone'] ?? '')) : null;
        $hobbies = $hobbiesProvided ? trim((string)($input['hobbies'] ?? '')) : null;
        $departmentInfo = $departmentInfoProvided ? trim((string)($input['department_info'] ?? '')) : null;
        $uid = (int)$this->sessionCtx->currentUser['id'];
        $role = (string)($this->sessionCtx->currentUser['role'] ?? '');

        if ($role === 'student') {
            $stmt = $this->pdo->prepare('UPDATE users SET email = :email WHERE id = :id');
            $stmt->execute([':email' => ($email === '' ? null : $email), ':id' => $uid]);
        } else {
            if ($name === '') {
                json_response(['success' => false, 'error' => 'Name is required'], 400);
            }
            $stmt = $this->pdo->prepare('UPDATE users SET name = :name, email = :email WHERE id = :id');
            $stmt->execute([':name' => $name, ':email' => ($email === '' ? null : $email), ':id' => $uid]);
        }

        if ($phoneProvided || $hobbiesProvided || $departmentInfoProvided) {
            $phone = ($phone === null || $phone === '') ? null : substr($phone, 0, 50);
            $hobbies = ($hobbies === null || $hobbies === '') ? null : substr($hobbies, 0, 1000);
            $departmentInfo = ($departmentInfo === null || $departmentInfo === '') ? null : substr($departmentInfo, 0, 2000);

            $this->pdo->prepare('INSERT INTO user_profiles (user_id) VALUES (:uid) ON DUPLICATE KEY UPDATE user_id = user_id')
                ->execute([':uid' => $uid]);

            $sets = [];
            $params = [':uid' => $uid];
            if ($phoneProvided) {
                $sets[] = 'phone = :phone';
                $params[':phone'] = $phone;
            }
            if ($hobbiesProvided) {
                $sets[] = 'hobbies = :hobbies';
                $params[':hobbies'] = $hobbies;
            }
            if ($departmentInfoProvided) {
                $sets[] = 'department_info = :dept_info';
                $params[':dept_info'] = $departmentInfo;
            }
            if (!empty($sets)) {
                $stmt = $this->pdo->prepare('UPDATE user_profiles SET ' . implode(', ', $sets) . ' WHERE user_id = :uid');
                $stmt->execute($params);
            }
        }

        $this->audit->log($uid, 'profile_updated', []);
        json_response(['success' => true]);
    }

    public function photoUpload(): void
    {
        Session::requireRole($this->sessionCtx, ['student']);
        require_method('POST');
        $input = read_json_body();
        $dataUrl = (string)($input['image_data'] ?? '');
        if ($dataUrl === '') {
            json_response(['success' => false, 'error' => 'image_data is required'], 400);
        }

        try {
            ensure_users_profile_photo_columns($this->pdo);
        } catch (Throwable $e) {
            json_response(['success' => false, 'error' => 'Profile photo feature requires a DB migration. Ask admin to run schema update.'], 500);
        }

        $uid = (int)$this->sessionCtx->currentUser['id'];
        $stmt = $this->pdo->prepare('SELECT profile_photo_path FROM users WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $uid]);
        $existing = $stmt->fetch();

        $rawImageData = normalize_profile_photo_data_url($dataUrl);
        $this->pdo->prepare('UPDATE users SET profile_photo_data = :photo_data, profile_photo_path = NULL WHERE id = :id')
            ->execute([':photo_data' => $rawImageData, ':id' => $uid]);

        $oldPath = $existing['profile_photo_path'] ?? null;
        if ($oldPath && str_starts_with((string)$oldPath, 'assets/uploads/profile_photos/')) {
            $oldAbs = dirname(__DIR__, 3) . '/' . $oldPath;
            if (is_file($oldAbs)) {
                @unlink($oldAbs);
            }
        }

        $this->audit->log($uid, 'profile_photo_updated', []);
        json_response([
            'success' => true,
            'profile_photo_url' => $rawImageData,
        ]);
    }
}
