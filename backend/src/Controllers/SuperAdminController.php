<?php

class SuperAdminController
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

    public function collegesList(): void
    {
        Session::requireRole($this->sessionCtx, ['super_admin']);
        ensure_college_settings_table($this->pdo);

        $stmt = $this->pdo->query(
            "SELECT c.id, c.name, c.logo, c.contact, c.status, c.created_at,
                    cs.short_code, cs.contact_email, cs.contact_phone,
                    COALESCE(u.total_users, 0) AS total_users,
                    COALESCE(u.students_count, 0) AS students_count,
                    COALESCE(u.faculty_count, 0) AS faculty_count,
                    COALESCE(u.college_admins_count, 0) AS college_admins_count
             FROM colleges c
             LEFT JOIN college_settings cs ON cs.college_id = c.id
             LEFT JOIN (
                SELECT college_id,
                       COUNT(*) AS total_users,
                       SUM(CASE WHEN role = 'student' THEN 1 ELSE 0 END) AS students_count,
                       SUM(CASE WHEN role = 'faculty' THEN 1 ELSE 0 END) AS faculty_count,
                       SUM(CASE WHEN role = 'college_admin' THEN 1 ELSE 0 END) AS college_admins_count
                FROM users
                GROUP BY college_id
             ) u ON u.college_id = c.id
             WHERE c.archived_at IS NULL AND c.status IN ('active','inactive')
             ORDER BY c.created_at DESC"
        );
        $rows = $stmt->fetchAll();
        json_response(['success' => true, 'colleges' => $rows]);
    }

    public function collegesArchiveList(): void
    {
        Session::requireRole($this->sessionCtx, ['super_admin']);
        ensure_college_settings_table($this->pdo);

        $stmt = $this->pdo->query(
            "SELECT c.id, c.name, c.logo, c.contact, c.status, c.created_at, c.archived_at,
                    cs.short_code, cs.contact_email, cs.contact_phone,
                    COALESCE(u.total_users, 0) AS total_users,
                    COALESCE(u.students_count, 0) AS students_count,
                    COALESCE(u.faculty_count, 0) AS faculty_count,
                    COALESCE(u.college_admins_count, 0) AS college_admins_count
             FROM colleges c
             LEFT JOIN college_settings cs ON cs.college_id = c.id
             LEFT JOIN (
                SELECT college_id,
                       COUNT(*) AS total_users,
                       SUM(CASE WHEN role = 'student' THEN 1 ELSE 0 END) AS students_count,
                       SUM(CASE WHEN role = 'faculty' THEN 1 ELSE 0 END) AS faculty_count,
                       SUM(CASE WHEN role = 'college_admin' THEN 1 ELSE 0 END) AS college_admins_count
                FROM users
                GROUP BY college_id
             ) u ON u.college_id = c.id
             WHERE c.archived_at IS NOT NULL OR c.status = 'removed'
             ORDER BY c.archived_at DESC, c.created_at DESC"
        );
        $rows = $stmt->fetchAll();
        json_response(['success' => true, 'colleges' => $rows]);
    }

    public function collegesRemove(): void
    {
        Session::requireRole($this->sessionCtx, ['super_admin']);
        require_method('POST');
        $input = read_json_body();
        $collegeId = isset($input['college_id']) ? (int)$input['college_id'] : 0;
        $reason = trim((string)($input['reason'] ?? ''));
        if ($collegeId <= 0) {
            json_response(['success' => false, 'error' => 'college_id is required'], 400);
        }

        $stmt = $this->pdo->prepare('SELECT id, status, archived_at FROM colleges WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $collegeId]);
        $college = $stmt->fetch();
        if (!$college) {
            json_response(['success' => false, 'error' => 'College not found'], 404);
        }

        $this->pdo->beginTransaction();
        try {
            $this->pdo->prepare(
                "UPDATE colleges SET status = 'removed', archived_at = COALESCE(archived_at, NOW()) WHERE id = :id"
            )->execute([':id' => $collegeId]);

            $this->pdo->prepare(
                "UPDATE users SET status = 'suspended' WHERE college_id = :cid AND role <> 'super_admin'"
            )->execute([':cid' => $collegeId]);

            $this->pdo->prepare(
                "UPDATE attendance_sessions SET status = 'closed', end_time = NOW() WHERE college_id = :cid AND status = 'active'"
            )->execute([':cid' => $collegeId]);

            $this->pdo->commit();
        } catch (Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        $this->audit->log($this->sessionCtx->currentUser['id'], 'college_removed', [
            'college_id' => $collegeId,
            'reason' => $reason === '' ? null : $reason,
        ]);
        json_response(['success' => true]);
    }

    public function collegesRestore(): void
    {
        Session::requireRole($this->sessionCtx, ['super_admin']);
        require_method('POST');
        $input = read_json_body();
        $collegeId = isset($input['college_id']) ? (int)$input['college_id'] : 0;
        $restoreStatus = trim((string)($input['status'] ?? 'inactive'));
        if ($collegeId <= 0) {
            json_response(['success' => false, 'error' => 'college_id is required'], 400);
        }
        if (!in_array($restoreStatus, ['active', 'inactive'], true)) {
            $restoreStatus = 'inactive';
        }

        $stmt = $this->pdo->prepare('SELECT id FROM colleges WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $collegeId]);
        if (!$stmt->fetch()) {
            json_response(['success' => false, 'error' => 'College not found'], 404);
        }

        $this->pdo->prepare('UPDATE colleges SET status = :status, archived_at = NULL WHERE id = :id')
            ->execute([':status' => $restoreStatus, ':id' => $collegeId]);

        $this->audit->log($this->sessionCtx->currentUser['id'], 'college_restored', [
            'college_id' => $collegeId,
            'status' => $restoreStatus,
        ]);
        json_response(['success' => true]);
    }

    public function collegeDetail(): void
    {
        Session::requireRole($this->sessionCtx, ['super_admin']);
        $collegeId = isset($_GET['college_id']) ? (int)$_GET['college_id'] : 0;
        if ($collegeId <= 0) {
            json_response(['success' => false, 'error' => 'college_id is required'], 400);
        }

        ensure_college_settings_table($this->pdo);

        $stmt = $this->pdo->prepare(
            'SELECT c.id, c.name, c.logo, c.contact, c.status, c.created_at,
                    cs.short_code, cs.contact_email, cs.contact_phone
             FROM colleges c
             LEFT JOIN college_settings cs ON cs.college_id = c.id
             WHERE c.id = :id
             LIMIT 1'
        );
        $stmt->execute([':id' => $collegeId]);
        $college = $stmt->fetch();
        if (!$college) {
            json_response(['success' => false, 'error' => 'College not found'], 404);
        }

        $stats = [
            'total_users' => 0, 'students_count' => 0,
            'faculty_count' => 0, 'college_admins_count' => 0,
            'departments_count' => 0, 'courses_count' => 0,
        ];

        $stmt = $this->pdo->prepare(
            "SELECT COUNT(*) AS total_users,
                    SUM(CASE WHEN role = 'student' THEN 1 ELSE 0 END) AS students_count,
                    SUM(CASE WHEN role = 'faculty' THEN 1 ELSE 0 END) AS faculty_count,
                    SUM(CASE WHEN role = 'college_admin' THEN 1 ELSE 0 END) AS college_admins_count
             FROM users WHERE college_id = :cid"
        );
        $stmt->execute([':cid' => $collegeId]);
        $row = $stmt->fetch();
        if ($row) {
            $stats['total_users'] = (int)($row['total_users'] ?? 0);
            $stats['students_count'] = (int)($row['students_count'] ?? 0);
            $stats['faculty_count'] = (int)($row['faculty_count'] ?? 0);
            $stats['college_admins_count'] = (int)($row['college_admins_count'] ?? 0);
        }

        $stmt = $this->pdo->prepare('SELECT COUNT(*) AS c FROM departments WHERE college_id = :cid');
        $stmt->execute([':cid' => $collegeId]);
        $stats['departments_count'] = (int)($stmt->fetch()['c'] ?? 0);

        $stmt = $this->pdo->prepare(
            'SELECT COUNT(*) AS c FROM courses_sections cs JOIN departments d ON d.id = cs.dept_id WHERE d.college_id = :cid'
        );
        $stmt->execute([':cid' => $collegeId]);
        $stats['courses_count'] = (int)($stmt->fetch()['c'] ?? 0);

        $stmt = $this->pdo->prepare(
            "SELECT u.id, u.unique_user_id, u.name, u.email, u.role, u.status, u.last_login
             FROM users u
             WHERE u.college_id = :cid
             ORDER BY FIELD(u.role, 'college_admin', 'faculty', 'student', 'super_admin'), u.name ASC, u.id DESC"
        );
        $stmt->execute([':cid' => $collegeId]);
        $users = $stmt->fetchAll();

        json_response(['success' => true, 'college' => $college, 'stats' => $stats, 'users' => $users]);
    }

    public function saDepartmentsList(): void
    {
        Session::requireRole($this->sessionCtx, ['super_admin']);
        $collegeId = isset($_GET['college_id']) ? (int)$_GET['college_id'] : 0;
        $includeRemoved = isset($_GET['include_removed']) ? (int)$_GET['include_removed'] : 0;

        $params = [];
        $where = 'WHERE 1=1';
        if ($collegeId > 0) {
            $where .= ' AND d.college_id = :cid';
            $params[':cid'] = $collegeId;
        }
        if ($includeRemoved !== 1) {
            $where .= " AND c.archived_at IS NULL AND c.status IN ('active','inactive')";
        }

        $stmt = $this->pdo->prepare(
            "SELECT d.id, d.college_id, c.name AS college_name, c.status AS college_status, c.archived_at AS college_archived_at,
                    d.name, d.status,
                    (SELECT COUNT(*) FROM courses_sections cs WHERE cs.dept_id = d.id) AS courses_count,
                    (SELECT COUNT(*) FROM students s JOIN users u ON u.id = s.user_id WHERE s.dept_id = d.id AND u.role = 'student' AND u.deleted_at IS NULL) AS students_count,
                    (SELECT COUNT(*) FROM faculty f JOIN users u ON u.id = f.user_id WHERE f.dept_id = d.id AND u.role = 'faculty' AND u.deleted_at IS NULL) AS faculty_count
             FROM departments d
             JOIN colleges c ON c.id = d.college_id
             {$where}
             ORDER BY c.name ASC, d.name ASC"
        );
        $stmt->execute($params);
        json_response(['success' => true, 'departments' => $stmt->fetchAll()]);
    }

    public function saStudentsList(): void
    {
        Session::requireRole($this->sessionCtx, ['super_admin']);
        $collegeId = isset($_GET['college_id']) ? (int)$_GET['college_id'] : 0;
        $includeArchived = isset($_GET['include_archived']) ? (int)$_GET['include_archived'] : 0;
        $includeRemoved = isset($_GET['include_removed']) ? (int)$_GET['include_removed'] : 0;

        $params = [];
        $where = "WHERE u.role = 'student'";
        if ($includeArchived !== 1) { $where .= ' AND u.deleted_at IS NULL'; }
        if ($collegeId > 0) { $where .= ' AND u.college_id = :cid'; $params[':cid'] = $collegeId; }
        if ($includeRemoved !== 1) { $where .= " AND (c.archived_at IS NULL AND c.status IN ('active','inactive'))"; }

        $stmt = $this->pdo->prepare(
            "SELECT u.id, u.unique_user_id, u.college_id, c.name AS college_name, c.status AS college_status, c.archived_at AS college_archived_at,
                    u.name, u.email, u.status, u.last_login, u.deleted_at,
                    d.name AS dept_name, s.course, s.year, s.semester, s.section, s.face_registered
             FROM users u
             JOIN students s ON s.user_id = u.id
             LEFT JOIN departments d ON d.id = s.dept_id
             LEFT JOIN colleges c ON c.id = u.college_id
             {$where}
             ORDER BY c.name ASC, d.name ASC, s.year ASC, s.semester ASC, s.section ASC, u.name ASC, u.id DESC"
        );
        $stmt->execute($params);
        json_response(['success' => true, 'students' => $stmt->fetchAll()]);
    }

    public function saFacultyList(): void
    {
        Session::requireRole($this->sessionCtx, ['super_admin']);
        $collegeId = isset($_GET['college_id']) ? (int)$_GET['college_id'] : 0;
        $includeArchived = isset($_GET['include_archived']) ? (int)$_GET['include_archived'] : 0;
        $includeRemoved = isset($_GET['include_removed']) ? (int)$_GET['include_removed'] : 0;

        $params = [];
        $where = "WHERE u.role = 'faculty'";
        if ($includeArchived !== 1) { $where .= ' AND u.deleted_at IS NULL'; }
        if ($collegeId > 0) { $where .= ' AND u.college_id = :cid'; $params[':cid'] = $collegeId; }
        if ($includeRemoved !== 1) { $where .= " AND (c.archived_at IS NULL AND c.status IN ('active','inactive'))"; }

        $stmt = $this->pdo->prepare(
            "SELECT u.id, u.unique_user_id, u.college_id, c.name AS college_name, c.status AS college_status, c.archived_at AS college_archived_at,
                    u.name, u.email, u.status, u.last_login, u.deleted_at,
                    f.dept_id, d.name AS dept_name, f.designation
             FROM users u
             JOIN faculty f ON f.user_id = u.id
             LEFT JOIN departments d ON d.id = f.dept_id
             LEFT JOIN colleges c ON c.id = u.college_id
             {$where}
             ORDER BY c.name ASC, d.name ASC, u.name ASC, u.id DESC"
        );
        $stmt->execute($params);
        json_response(['success' => true, 'faculty' => $stmt->fetchAll()]);
    }

    public function platformSettingsGet(): void
    {
        Session::requireRole($this->sessionCtx, ['super_admin']);
        $this->pdo->exec('CREATE TABLE IF NOT EXISTS platform_settings (
            setting_key VARCHAR(100) PRIMARY KEY,
            setting_value TEXT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
        $rows = $this->pdo->query('SELECT setting_key, setting_value FROM platform_settings')->fetchAll();
        $out = [];
        foreach ($rows as $row) { $out[$row['setting_key']] = $row['setting_value']; }
        json_response(['success' => true, 'settings' => $out]);
    }

    public function platformSettingsSave(): void
    {
        Session::requireRole($this->sessionCtx, ['super_admin']);
        require_method('POST');
        $input = read_json_body();
        $timezone = trim((string)($input['timezone'] ?? 'UTC'));
        $sessionTimeout = isset($input['session_timeout']) ? (int)$input['session_timeout'] : 30;
        $maxAttempts = isset($input['max_login_attempts']) ? (int)$input['max_login_attempts'] : 5;
        $maintenanceMsg = trim((string)($input['maintenance_message'] ?? ''));

        $this->pdo->exec('CREATE TABLE IF NOT EXISTS platform_settings (
            setting_key VARCHAR(100) PRIMARY KEY,
            setting_value TEXT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');

        $settings = [
            'timezone' => $timezone,
            'session_timeout' => (string)$sessionTimeout,
            'max_login_attempts' => (string)$maxAttempts,
            'maintenance_message' => $maintenanceMsg,
        ];
        $stmt = $this->pdo->prepare(
            'INSERT INTO platform_settings (setting_key, setting_value) VALUES (:k, :v)
             ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)'
        );
        foreach ($settings as $key => $value) {
            $stmt->execute([':k' => $key, ':v' => $value]);
        }
        $this->audit->log($this->sessionCtx->currentUser['id'], 'platform_settings_saved', []);
        json_response(['success' => true]);
    }

    public function platformNoticeGet(): void
    {
        Session::requireAuth($this->sessionCtx);
        $this->pdo->exec('CREATE TABLE IF NOT EXISTS platform_settings (
            setting_key VARCHAR(100) PRIMARY KEY,
            setting_value TEXT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
        $stmt = $this->pdo->prepare('SELECT setting_value FROM platform_settings WHERE setting_key = :k LIMIT 1');
        $stmt->execute([':k' => 'maintenance_message']);
        $maintenance = (string)($stmt->fetch()['setting_value'] ?? '');
        json_response(['success' => true, 'maintenance_message' => $maintenance]);
    }

    public function usersOverview(): void
    {
        Session::requireRole($this->sessionCtx, ['super_admin']);
        $totals = $this->pdo->query('SELECT role, COUNT(*) AS count FROM users WHERE deleted_at IS NULL GROUP BY role')->fetchAll();
        $active = $this->pdo->query("SELECT COUNT(*) AS active_users FROM users WHERE status = 'active' AND deleted_at IS NULL")->fetch();
        json_response([
            'success' => true,
            'by_role' => $totals,
            'active_users' => (int)($active['active_users'] ?? 0),
        ]);
    }

    public function usersList(): void
    {
        Session::requireRole($this->sessionCtx, ['super_admin']);
        $stmt = $this->pdo->query(
            'SELECT u.id, u.unique_user_id, u.name, u.email, u.role, u.status, u.college_id, u.last_login,
                    c.name AS college_name, u.deleted_at
             FROM users u
             LEFT JOIN colleges c ON c.id = u.college_id
             ORDER BY u.id DESC'
        );
        json_response(['success' => true, 'users' => $stmt->fetchAll()]);
    }

    public function generateUniqueId(): void
    {
        Session::requireRole($this->sessionCtx, ['super_admin']);
        require_method('POST');
        $input = read_json_body();
        $roleType = trim((string)($input['role'] ?? ''));
        $collegeId = isset($input['college_id']) ? (int)$input['college_id'] : 0;

        if (!in_array($roleType, ['college_admin', 'faculty', 'student'], true)) {
            json_response(['success' => false, 'error' => 'Invalid role type. Must be college_admin, faculty, or student'], 400);
        }
        if ($roleType !== 'college_admin' && $collegeId <= 0) {
            json_response(['success' => false, 'error' => 'college_id is required for faculty and student'], 400);
        }

        try {
            if ($roleType === 'college_admin') {
                $newId = generate_college_admin_unique_id($this->pdo);
            } elseif ($roleType === 'faculty') {
                $newId = generate_faculty_unique_id($this->pdo, $collegeId);
            } else {
                $newId = generate_student_unique_id($this->pdo, $collegeId);
            }
            json_response(['success' => true, 'unique_id' => $newId]);
        } catch (Throwable $e) {
            json_response(['success' => false, 'error' => 'Failed: ' . $e->getMessage()], 500);
        }
    }

    public function generatePassword(): void
    {
        Session::requireRole($this->sessionCtx, ['super_admin', 'college_admin']);
        require_method('POST');
        json_response(['success' => true, 'password' => generate_secure_password()]);
    }

    public function usersCreate(): void
    {
        Session::requireRole($this->sessionCtx, ['super_admin']);
        require_method('POST');
        $input = read_json_body();
        $uniqueId = trim((string)($input['unique_user_id'] ?? ''));
        $name = trim((string)($input['name'] ?? ''));
        $email = trim((string)($input['email'] ?? ''));
        $password = (string)($input['password'] ?? '');
        $collegeId = isset($input['college_id']) ? (int)$input['college_id'] : 0;
        $status = trim((string)($input['status'] ?? 'active'));

        if ($uniqueId === '' || $name === '' || $password === '' || $collegeId <= 0) {
            json_response(['success' => false, 'error' => 'unique_user_id, name, password and college_id are required'], 400);
        }
        if (!in_array($status, ['active', 'suspended', 'pending'], true)) {
            json_response(['success' => false, 'error' => 'Invalid status'], 400);
        }

        $stmt = $this->pdo->prepare('SELECT id FROM colleges WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $collegeId]);
        if (!$stmt->fetch()) {
            json_response(['success' => false, 'error' => 'College not found'], 404);
        }

        $hash = password_hash($password, PASSWORD_DEFAULT);
        try {
            $stmt = $this->pdo->prepare(
                'INSERT INTO users (unique_user_id, college_id, name, email, password_hash, role, status)
                 VALUES (:uid, :cid, :name, :email, :hash, "college_admin", :status)'
            );
            $stmt->execute([
                ':uid' => $uniqueId, ':cid' => $collegeId, ':name' => $name,
                ':email' => ($email === '' ? null : $email), ':hash' => $hash, ':status' => $status,
            ]);
        } catch (PDOException $e) {
            if ((string)$e->getCode() === '23000') {
                json_response(['success' => false, 'error' => 'User ID or email already exists'], 409);
            }
            throw $e;
        }

        $newUserId = (int)$this->pdo->lastInsertId();
        $this->audit->log($this->sessionCtx->currentUser['id'], 'user_created', [
            'user_id' => $newUserId, 'unique_user_id' => $uniqueId, 'role' => 'college_admin', 'college_id' => $collegeId,
        ]);
        json_response(['success' => true, 'user_id' => $newUserId]);
    }

    public function usersUpdate(): void
    {
        Session::requireRole($this->sessionCtx, ['super_admin']);
        require_method('POST');
        $input = read_json_body();
        $userId = isset($input['user_id']) ? (int)$input['user_id'] : 0;
        $role = trim((string)($input['role'] ?? ''));
        $status = trim((string)($input['status'] ?? ''));
        $collegeIdInput = $input['college_id'] ?? null;
        $collegeId = null;
        if ($userId <= 0 || $role === '' || $status === '') {
            json_response(['success' => false, 'error' => 'user_id, role and status are required'], 400);
        }
        if (!in_array($role, ['super_admin', 'college_admin', 'faculty', 'student'], true)) {
            json_response(['success' => false, 'error' => 'Invalid role'], 400);
        }
        if (!in_array($status, ['active', 'suspended', 'pending'], true)) {
            json_response(['success' => false, 'error' => 'Invalid status'], 400);
        }

        $stmt = $this->pdo->prepare('SELECT id, role, status, college_id FROM users WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $userId]);
        $existingUser = $stmt->fetch();
        if (!$existingUser) {
            json_response(['success' => false, 'error' => 'User not found'], 404);
        }

        if ($collegeIdInput !== null && $collegeIdInput !== '') {
            $collegeId = (int)$collegeIdInput;
            if ($collegeId <= 0) { json_response(['success' => false, 'error' => 'Invalid college_id'], 400); }
        }

        if ($role === 'super_admin') {
            $collegeId = null;
        } else {
            if ($collegeId === null) { json_response(['success' => false, 'error' => 'college_id is required for this role'], 400); }
            $stmt = $this->pdo->prepare('SELECT id FROM colleges WHERE id = :id LIMIT 1');
            $stmt->execute([':id' => $collegeId]);
            if (!$stmt->fetch()) { json_response(['success' => false, 'error' => 'College not found'], 404); }
        }

        if ((int)$this->sessionCtx->currentUser['id'] === $userId) {
            if ($role !== $existingUser['role'] || $status !== $existingUser['status'] || (string)($collegeId ?? '') !== (string)($existingUser['college_id'] ?? '')) {
                json_response(['success' => false, 'error' => 'You cannot change your own role/status/college from users panel'], 400);
            }
        }

        if ($existingUser['role'] === 'super_admin' && $role !== 'super_admin') {
            $saCount = (int)$this->pdo->query("SELECT COUNT(*) AS c FROM users WHERE role = 'super_admin' AND status = 'active'")->fetch()['c'];
            if ($saCount <= 1) { json_response(['success' => false, 'error' => 'At least one active super admin is required'], 400); }
        }
        if ($existingUser['role'] === 'super_admin' && $status !== 'active') {
            $saCount = (int)$this->pdo->query("SELECT COUNT(*) AS c FROM users WHERE role = 'super_admin' AND status = 'active'")->fetch()['c'];
            if ($saCount <= 1) { json_response(['success' => false, 'error' => 'At least one active super admin is required'], 400); }
        }

        $stmt = $this->pdo->prepare('UPDATE users SET role = :role, status = :status, college_id = :college_id WHERE id = :id');
        $stmt->execute([':role' => $role, ':status' => $status, ':college_id' => $collegeId, ':id' => $userId]);
        if ($stmt->rowCount() === 0) {
            json_response(['success' => false, 'error' => 'User not found or unchanged'], 404);
        }

        $this->audit->log($this->sessionCtx->currentUser['id'], 'user_updated', ['user_id' => $userId, 'role' => $role, 'status' => $status, 'college_id' => $collegeId]);
        json_response(['success' => true]);
    }

    public function usersDelete(): void
    {
        Session::requireRole($this->sessionCtx, ['super_admin']);
        require_method('POST');
        $input = read_json_body();
        $userId = isset($input['user_id']) ? (int)$input['user_id'] : 0;
        if ($userId <= 0) { json_response(['success' => false, 'error' => 'user_id is required'], 400); }
        if ($this->sessionCtx->currentUser['id'] === $userId) {
            json_response(['success' => false, 'error' => 'You cannot delete your own account'], 400);
        }

        $stmt = $this->pdo->prepare('SELECT role, status FROM users WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $userId]);
        $targetUser = $stmt->fetch();
        if (!$targetUser) { json_response(['success' => false, 'error' => 'User not found'], 404); }
        if ($targetUser['role'] === 'super_admin') {
            $saCount = (int)$this->pdo->query("SELECT COUNT(*) AS c FROM users WHERE role = 'super_admin'")->fetch()['c'];
            if ($saCount <= 1) { json_response(['success' => false, 'error' => 'At least one super admin is required'], 400); }
        }

        $stmt = $this->pdo->prepare('DELETE FROM users WHERE id = :id');
        $stmt->execute([':id' => $userId]);
        if ($stmt->rowCount() === 0) { json_response(['success' => false, 'error' => 'User not found'], 404); }

        $this->audit->log($this->sessionCtx->currentUser['id'], 'user_deleted', ['user_id' => $userId]);
        json_response(['success' => true]);
    }


    public function superadminCollegesDelete(): void
    {
        Session::requireRole($this->sessionCtx, ['super_admin']);
        require_method('POST');
        $input = read_json_body();
        $cid = isset($input['college_id']) ? (int)$input['college_id'] : 0;
        if ($cid <= 0) { json_response(['success' => false, 'error' => 'college_id required'], 400); }

        try {
            $stmt = $this->pdo->prepare('SELECT id FROM colleges WHERE id = :id LIMIT 1');
            $stmt->execute([':id' => $cid]);
            if (!$stmt->fetch()) { json_response(['success' => false, 'error' => 'College not found'], 404); }
            $this->pdo->prepare('DELETE FROM colleges WHERE id = :id')->execute([':id' => $cid]);
            $this->audit->log($this->sessionCtx->currentUser['id'], 'superadmin_college_deleted', ['college_id' => $cid]);
            json_response(['success' => true]);
        } catch (Throwable $e) {
            json_response(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }

    public function auditLogsList(): void
    {
        Session::requireRole($this->sessionCtx, ['super_admin']);
        $params = [];
        $conditions = [];
        if (!empty($_GET['from'])) { $conditions[] = 'a.timestamp >= :from'; $params[':from'] = $_GET['from']; }
        if (!empty($_GET['to'])) { $conditions[] = 'a.timestamp <= :to'; $params[':to'] = $_GET['to']; }
        if (!empty($_GET['action'])) { $conditions[] = 'a.action = :action'; $params[':action'] = $_GET['action']; }
        if (!empty($_GET['role'])) { $conditions[] = 'u.role = :role'; $params[':role'] = $_GET['role']; }

        $sql = 'SELECT a.id, a.timestamp, a.action, a.ip_address, a.metadata,
                       u.unique_user_id, u.name, u.role
                FROM audit_logs a
                LEFT JOIN users u ON a.user_id = u.id';
        if ($conditions) { $sql .= ' WHERE ' . implode(' AND ', $conditions); }
        $sql .= ' ORDER BY a.timestamp DESC LIMIT 200';

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        json_response(['success' => true, 'logs' => $stmt->fetchAll()]);
    }

    public function dashboardSummary(): void
    {
        Session::requireRole($this->sessionCtx, ['super_admin']);

        $totalColleges = (int)($this->pdo->query('SELECT COUNT(*) AS c FROM colleges WHERE archived_at IS NULL')->fetch()['c'] ?? 0);
        $activeUsers = (int)($this->pdo->query("SELECT COUNT(*) AS c FROM users WHERE status = 'active' AND deleted_at IS NULL")->fetch()['c'] ?? 0);
        $activeColleges = (int)($this->pdo->query("SELECT COUNT(*) AS c FROM colleges WHERE status = 'active' AND archived_at IS NULL")->fetch()['c'] ?? 0);

        $monthStart = (new DateTime('first day of this month 00:00:00'))->format('Y-m-d H:i:s');
        $nextMonthStart = (new DateTime('first day of next month 00:00:00'))->format('Y-m-d H:i:s');
        $monthlyStmt = $this->pdo->prepare('SELECT COUNT(*) AS c FROM attendance_sessions WHERE start_time >= :from_ts AND start_time < :to_ts');
        $monthlyStmt->execute([':from_ts' => $monthStart, ':to_ts' => $nextMonthStart]);
        $monthlySessions = (int)($monthlyStmt->fetch()['c'] ?? 0);

        // Platform Usage Trend (Last 7 Days)
        $usageTrend = [];
        for ($i = 6; $i >= 0; $i--) {
            $date = date('Y-m-d', strtotime("-$i days"));
            $uStmt = $this->pdo->prepare("SELECT COUNT(*) as count FROM attendance_sessions WHERE DATE(start_time) = :date");
            $uStmt->execute([':date' => $date]);
            $usageTrend[] = ['date' => $date, 'count' => (int)($uStmt->fetch()['count'] ?? 0)];
        }

        // Revenue Trend (Mock logic for subscription analytics)
        $revenueTrend = [];
        for ($i = 5; $i >= 0; $i--) {
            $month = date('Y-m', strtotime("-$i months"));
            // Mock: $49.99 per active college per month
            $revenueTrend[] = ['month' => $month, 'amount' => round($activeColleges * 49.99, 2)];
        }

        $activityStmt = $this->pdo->query(
            'SELECT a.timestamp, a.action, u.name FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.timestamp DESC LIMIT 10'
        );
        $recentActivity = $activityStmt->fetchAll();

        json_response([
            'success' => true,
            'stats' => [
                'total_colleges' => $totalColleges, 
                'active_users' => $activeUsers,
                'monthly_sessions' => $monthlySessions, 
                'active_colleges' => $activeColleges,
                'active_subscriptions' => $activeColleges, 
                'mrr' => round($activeColleges * 49.99, 2), 
                'uptime' => '99.9%'
            ],
            'charts' => [
                'usage_trend' => $usageTrend,
                'revenue_trend' => $revenueTrend
            ],
            'recent_activity' => $recentActivity,
        ]);
    }
}
