<?php

class CollegeAdminController
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

    public function studentsList(): void
    {
        Session::requireRole($this->sessionCtx, ['college_admin']);
        $collegeId = require_college_id($this->sessionCtx->currentUser);
        $stmt = $this->pdo->prepare(
            'SELECT u.id, u.unique_user_id, u.name, u.email, u.status,
                    s.dept_id, d.name AS dept_name, s.course, s.year, s.semester, s.section
             FROM users u
             JOIN students s ON s.user_id = u.id
             LEFT JOIN departments d ON d.id = s.dept_id
             WHERE u.college_id = :cid AND u.role = "student" AND u.deleted_at IS NULL
             ORDER BY d.name ASC, s.year ASC, s.semester ASC, s.section ASC, u.name ASC'
        );
        $stmt->execute([':cid' => $collegeId]);
        json_response(['success' => true, 'students' => $stmt->fetchAll()]);
    }

    public function facultyList(): void
    {
        Session::requireRole($this->sessionCtx, ['college_admin']);
        $collegeId = require_college_id($this->sessionCtx->currentUser);
        $stmt = $this->pdo->prepare(
            'SELECT u.id, u.unique_user_id, u.name, u.email, u.status,
                    f.dept_id, d.name AS dept_name, f.designation
             FROM users u
             JOIN faculty f ON f.user_id = u.id
             LEFT JOIN departments d ON d.id = f.dept_id
             WHERE u.college_id = :cid AND u.role = "faculty" AND u.deleted_at IS NULL
             ORDER BY d.name ASC, u.name ASC'
        );
        $stmt->execute([':cid' => $collegeId]);
        json_response(['success' => true, 'faculty' => $stmt->fetchAll()]);
    }

    public function archiveList(): void
    {
        Session::requireRole($this->sessionCtx, ['college_admin']);
        $collegeId = require_college_id($this->sessionCtx->currentUser);

        $userStmt = $this->pdo->prepare(
            'SELECT u.id, u.unique_user_id, u.name, u.email, u.role, u.status, u.deleted_at
             FROM users u
             WHERE u.college_id = :cid AND u.deleted_at IS NOT NULL AND u.role IN ("student","faculty")
             ORDER BY u.deleted_at DESC, u.id DESC'
        );
        $userStmt->execute([':cid' => $collegeId]);

        $deptStmt = $this->pdo->prepare(
            "SELECT id, name, status FROM departments WHERE college_id = :cid AND status = 'inactive' ORDER BY name ASC"
        );
        $deptStmt->execute([':cid' => $collegeId]);

        json_response([
            'success' => true,
            'archived_users' => $userStmt->fetchAll(),
            'archived_departments' => $deptStmt->fetchAll(),
        ]);
    }

    public function userUpdate(): void
    {
        Session::requireRole($this->sessionCtx, ['college_admin']);
        require_method('POST');
        $input = read_json_body();
        $userId = isset($input['user_id']) ? (int)$input['user_id'] : 0;
        $status = trim((string)($input['status'] ?? ''));
        $targetRole = trim((string)($input['role'] ?? ''));
        if ($userId <= 0 || $status === '' || $targetRole === '') {
            json_response(['success' => false, 'error' => 'user_id, role and status are required'], 400);
        }
        if (!in_array($targetRole, ['student', 'faculty'], true)) {
            json_response(['success' => false, 'error' => 'Invalid role target'], 400);
        }
        if (!in_array($status, ['active', 'suspended', 'pending'], true)) {
            json_response(['success' => false, 'error' => 'Invalid status'], 400);
        }

        $collegeId = require_college_id($this->sessionCtx->currentUser);
        $stmt = $this->pdo->prepare('UPDATE users SET status = :status, deleted_at = NULL WHERE id = :id AND college_id = :cid AND role = :role');
        $stmt->execute([':status' => $status, ':id' => $userId, ':cid' => $collegeId, ':role' => $targetRole]);
        if ($stmt->rowCount() === 0) {
            json_response(['success' => false, 'error' => 'User not found or unchanged'], 404);
        }

        $this->audit->log($this->sessionCtx->currentUser['id'], 'college_admin_user_updated', ['user_id' => $userId, 'role' => $targetRole, 'status' => $status]);
        json_response(['success' => true]);
    }

    public function studentUpdate(): void
    {
        Session::requireRole($this->sessionCtx, ['college_admin']);
        require_method('POST');
        $input = read_json_body();
        $collegeId = require_college_id($this->sessionCtx->currentUser);
        $userId = isset($input['user_id']) ? (int)$input['user_id'] : 0;
        $name = trim((string)($input['name'] ?? ''));
        $email = trim((string)($input['email'] ?? ''));
        $deptName = trim((string)($input['dept_name'] ?? 'General'));
        $courseName = trim((string)($input['course_name'] ?? 'General'));
        $year = max(1, (int)($input['year'] ?? 1));
        $semester = max(1, min(8, (int)($input['semester'] ?? (($year * 2) - 1))));
        $section = trim((string)($input['section'] ?? 'A'));
        $status = trim((string)($input['status'] ?? ''));

        if ($userId <= 0 || $name === '') {
            json_response(['success' => false, 'error' => 'user_id and name are required'], 400);
        }
        if ($status !== '' && !in_array($status, ['active', 'suspended', 'pending'], true)) {
            json_response(['success' => false, 'error' => 'Invalid status'], 400);
        }

        $this->pdo->beginTransaction();
        try {
            $checkStmt = $this->pdo->prepare('SELECT id FROM users WHERE id = :id AND college_id = :cid AND role = "student" LIMIT 1 FOR UPDATE');
            $checkStmt->execute([':id' => $userId, ':cid' => $collegeId]);
            if (!$checkStmt->fetch()) { $this->pdo->rollBack(); json_response(['success' => false, 'error' => 'Student not found'], 404); }

            $deptStmt = $this->pdo->prepare('INSERT INTO departments (college_id, name, status) VALUES (:cid, :name, "active") ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), status = "active"');
            $deptStmt->execute([':cid' => $collegeId, ':name' => ($deptName === '' ? 'General' : $deptName)]);
            $deptId = (int)$this->pdo->lastInsertId();

            $courseStmt = $this->pdo->prepare('INSERT INTO courses_sections (dept_id, course_name, year, semester, section) VALUES (:dept, :course, :year, :semester, :section) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)');
            $courseStmt->execute([':dept' => $deptId, ':course' => ($courseName === '' ? 'General' : $courseName), ':year' => $year, ':semester' => $semester, ':section' => ($section === '' ? 'A' : $section)]);

            $userSql = 'UPDATE users SET name = :name, email = :email';
            $userParams = [':name' => $name, ':email' => ($email === '' ? null : $email), ':id' => $userId, ':cid' => $collegeId];
            if ($status !== '') { $userSql .= ', status = :status'; $userParams[':status'] = $status; }
            $userSql .= ' WHERE id = :id AND college_id = :cid AND role = "student"';
            $this->pdo->prepare($userSql)->execute($userParams);

            $sStmt = $this->pdo->prepare(
                'UPDATE students s JOIN users u ON u.id = s.user_id
                 SET s.dept_id = :dept, s.course = :course, s.year = :year, s.semester = :semester, s.section = :section
                 WHERE u.id = :id AND u.college_id = :cid AND u.role = "student"'
            );
            $sStmt->execute([':dept' => $deptId, ':course' => ($courseName === '' ? null : $courseName), ':year' => $year, ':semester' => $semester, ':section' => ($section === '' ? 'A' : $section), ':id' => $userId, ':cid' => $collegeId]);
            $this->pdo->commit();
        } catch (PDOException $e) {
            $this->pdo->rollBack();
            if ((string)$e->getCode() === '23000') { json_response(['success' => false, 'error' => 'User ID or email already exists'], 409); }
            throw $e;
        } catch (Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        $this->audit->log($this->sessionCtx->currentUser['id'], 'college_admin_student_updated', ['user_id' => $userId]);
        json_response(['success' => true]);
    }

    public function facultyUpdate(): void
    {
        Session::requireRole($this->sessionCtx, ['college_admin']);
        require_method('POST');
        $input = read_json_body();
        $collegeId = require_college_id($this->sessionCtx->currentUser);
        $userId = isset($input['user_id']) ? (int)$input['user_id'] : 0;
        $name = trim((string)($input['name'] ?? ''));
        $email = trim((string)($input['email'] ?? ''));
        $deptName = trim((string)($input['dept_name'] ?? 'General'));
        $designation = trim((string)($input['designation'] ?? 'Faculty'));
        $status = trim((string)($input['status'] ?? ''));

        if ($userId <= 0 || $name === '') { json_response(['success' => false, 'error' => 'user_id and name are required'], 400); }
        if ($status !== '' && !in_array($status, ['active', 'suspended', 'pending'], true)) { json_response(['success' => false, 'error' => 'Invalid status'], 400); }

        $this->pdo->beginTransaction();
        try {
            $checkStmt = $this->pdo->prepare('SELECT id FROM users WHERE id = :id AND college_id = :cid AND role = "faculty" LIMIT 1 FOR UPDATE');
            $checkStmt->execute([':id' => $userId, ':cid' => $collegeId]);
            if (!$checkStmt->fetch()) { $this->pdo->rollBack(); json_response(['success' => false, 'error' => 'Faculty not found'], 404); }

            $deptStmt = $this->pdo->prepare('INSERT INTO departments (college_id, name, status) VALUES (:cid, :name, "active") ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), status = "active"');
            $deptStmt->execute([':cid' => $collegeId, ':name' => ($deptName === '' ? 'General' : $deptName)]);
            $deptId = (int)$this->pdo->lastInsertId();

            $userSql = 'UPDATE users SET name = :name, email = :email';
            $userParams = [':name' => $name, ':email' => ($email === '' ? null : $email), ':id' => $userId, ':cid' => $collegeId];
            if ($status !== '') { $userSql .= ', status = :status'; $userParams[':status'] = $status; }
            $userSql .= ' WHERE id = :id AND college_id = :cid AND role = "faculty"';
            $this->pdo->prepare($userSql)->execute($userParams);

            $fStmt = $this->pdo->prepare(
                'UPDATE faculty f JOIN users u ON u.id = f.user_id SET f.dept_id = :dept, f.designation = :designation WHERE u.id = :id AND u.college_id = :cid AND u.role = "faculty"'
            );
            $fStmt->execute([':dept' => $deptId, ':designation' => ($designation === '' ? null : $designation), ':id' => $userId, ':cid' => $collegeId]);
            $this->pdo->commit();
        } catch (PDOException $e) {
            $this->pdo->rollBack();
            if ((string)$e->getCode() === '23000') { json_response(['success' => false, 'error' => 'User ID or email already exists'], 409); }
            throw $e;
        } catch (Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        $this->audit->log($this->sessionCtx->currentUser['id'], 'college_admin_faculty_updated', ['user_id' => $userId]);
        json_response(['success' => true]);
    }

    public function userDelete(): void
    {
        Session::requireRole($this->sessionCtx, ['college_admin']);
        require_method('POST');
        $input = read_json_body();
        $userId = isset($input['user_id']) ? (int)$input['user_id'] : 0;
        $targetRole = trim((string)($input['role'] ?? ''));
        if ($userId <= 0 || $targetRole === '') { json_response(['success' => false, 'error' => 'user_id and role are required'], 400); }
        if (!in_array($targetRole, ['student', 'faculty'], true)) { json_response(['success' => false, 'error' => 'Invalid role target'], 400); }

        $collegeId = require_college_id($this->sessionCtx->currentUser);
        $stmt = $this->pdo->prepare('UPDATE users SET status = "suspended", deleted_at = NOW() WHERE id = :id AND college_id = :cid AND role = :role AND deleted_at IS NULL');
        $stmt->execute([':id' => $userId, ':cid' => $collegeId, ':role' => $targetRole]);
        if ($stmt->rowCount() === 0) { json_response(['success' => false, 'error' => 'User not found or already archived'], 404); }

        $this->audit->log($this->sessionCtx->currentUser['id'], 'college_admin_user_archived', ['user_id' => $userId, 'role' => $targetRole]);
        json_response(['success' => true]);
    }

    public function userPurge(): void
    {
        Session::requireRole($this->sessionCtx, ['college_admin']);
        require_method('POST');
        $input = read_json_body();
        $userId = isset($input['user_id']) ? (int)$input['user_id'] : 0;
        $targetRole = trim((string)($input['role'] ?? ''));
        if ($userId <= 0 || $targetRole === '') { json_response(['success' => false, 'error' => 'user_id and role are required'], 400); }
        if (!in_array($targetRole, ['student', 'faculty'], true)) { json_response(['success' => false, 'error' => 'Invalid role target'], 400); }

        $collegeId = require_college_id($this->sessionCtx->currentUser);
        $stmt = $this->pdo->prepare('DELETE FROM users WHERE id = :id AND college_id = :cid AND role = :role AND deleted_at IS NOT NULL');
        $stmt->execute([':id' => $userId, ':cid' => $collegeId, ':role' => $targetRole]);
        if ($stmt->rowCount() === 0) { json_response(['success' => false, 'error' => 'User not found or not archived'], 404); }

        $this->audit->log($this->sessionCtx->currentUser['id'], 'college_admin_user_purged', ['user_id' => $userId, 'role' => $targetRole]);
        json_response(['success' => true]);
    }

    public function studentCreate(): void
    {
        Session::requireRole($this->sessionCtx, ['college_admin']);
        require_method('POST');
        $input = read_json_body();
        $collegeId = require_college_id($this->sessionCtx->currentUser);
        $uniqueId = trim((string)($input['unique_user_id'] ?? ''));
        $name = trim((string)($input['name'] ?? ''));
        $email = trim((string)($input['email'] ?? ''));
        $deptName = trim((string)($input['dept_name'] ?? 'General'));
        $courseName = trim((string)($input['course_name'] ?? 'General'));
        $year = max(1, (int)($input['year'] ?? 1));
        $semester = max(1, min(8, (int)($input['semester'] ?? (($year * 2) - 1))));
        $section = trim((string)($input['section'] ?? 'A'));
        $password = (string)($input['password'] ?? 'Student@123');
        if ($name === '') { json_response(['success' => false, 'error' => 'name is required'], 400); }

        $this->pdo->beginTransaction();
        try {
            $this->pdo->prepare('INSERT INTO departments (college_id, name, status) VALUES (:cid, :name, "active") ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), status = "active"')
                ->execute([':cid' => $collegeId, ':name' => $deptName]);
            $deptId = (int)$this->pdo->lastInsertId();

            $this->pdo->prepare('INSERT INTO courses_sections (dept_id, course_name, year, semester, section) VALUES (:dept, :course, :year, :semester, :section) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)')
                ->execute([':dept' => $deptId, ':course' => $courseName, ':year' => $year, ':semester' => $semester, ':section' => $section]);

            if ($uniqueId === '') { $uniqueId = generate_student_unique_id($this->pdo, $collegeId); }

            $hash = password_hash($password, PASSWORD_DEFAULT);
            $this->pdo->prepare('INSERT INTO users (unique_user_id, college_id, name, email, password_hash, role, status) VALUES (:uid, :cid, :name, :email, :hash, "student", "active")')
                ->execute([':uid' => $uniqueId, ':cid' => $collegeId, ':name' => $name, ':email' => ($email === '' ? null : $email), ':hash' => $hash]);
            $userId = (int)$this->pdo->lastInsertId();

            $this->pdo->prepare('INSERT INTO students (user_id, dept_id, course, year, semester, section, face_registered) VALUES (:uid, :dept, :course, :year, :semester, :section, 0)')
                ->execute([':uid' => $userId, ':dept' => $deptId, ':course' => $courseName, ':year' => $year, ':semester' => $semester, ':section' => $section]);
            $this->pdo->commit();
        } catch (Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        $this->audit->log($this->sessionCtx->currentUser['id'], 'college_admin_student_created', ['unique_user_id' => $uniqueId]);
        json_response(['success' => true, 'unique_user_id' => $uniqueId]);
    }

    public function studentBulkImport(): void
    {
        Session::requireRole($this->sessionCtx, ['college_admin']);
        require_method('POST');
        $input = read_json_body();
        $rowsInput = $input['rows'] ?? null;
        $defaultPassword = trim((string)($input['default_password'] ?? 'Student@123'));
        $collegeId = require_college_id($this->sessionCtx->currentUser);

        if (!is_array($rowsInput) || !$rowsInput) {
            json_response(['success' => false, 'error' => 'rows array is required'], 400);
        }

        // Phase 1: Validate all rows before inserting anything
        $normalizedRows = [];
        $rowErrors = [];
        foreach ($rowsInput as $index => $row) {
            $rowNumber = is_array($row) && isset($row['row_number']) ? (int)$row['row_number'] : ($index + 2);
            if (!is_array($row)) {
                $rowErrors[] = ['row' => $rowNumber, 'error' => sprintf('Row %d: invalid payload', $rowNumber)];
                continue;
            }

            $name = trim((string)($row['name'] ?? $row['student_name'] ?? ''));
            $uniqueId = trim((string)($row['unique_user_id'] ?? $row['student_id'] ?? $row['login_id'] ?? $row['id'] ?? ''));
            $email = trim((string)($row['email'] ?? $row['student_email'] ?? ''));
            $deptName = trim((string)($row['dept_name'] ?? $row['department'] ?? $row['dept'] ?? 'General'));
            $courseName = trim((string)($row['course_name'] ?? $row['course'] ?? 'General'));
            $year = (int)($row['year'] ?? 1);
            $semester = (int)($row['semester'] ?? $row['sem'] ?? 0);
            $section = strtoupper(trim((string)($row['section'] ?? 'A')));
            $password = trim((string)($row['password'] ?? ''));

            if ($name === '') {
                $rowErrors[] = ['row' => $rowNumber, 'error' => sprintf('Row %d: name is required', $rowNumber)];
                continue;
            }
            if ($year <= 0) { $year = 1; }
            if ($semester <= 0) { $semester = max(1, ($year * 2) - 1); }
            $semester = max(1, min(8, $semester));
            if ($section === '') { $section = 'A'; }
            if ($deptName === '') { $deptName = 'General'; }
            if ($courseName === '') { $courseName = 'General'; }
            if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
                $rowErrors[] = ['row' => $rowNumber, 'error' => sprintf('Row %d: invalid email "%s"', $rowNumber, $email)];
                continue;
            }

            // Check for duplicate unique_user_id within the CSV itself
            if ($uniqueId !== '') {
                foreach ($normalizedRows as $prev) {
                    if ($prev['unique_user_id'] === $uniqueId) {
                        $rowErrors[] = ['row' => $rowNumber, 'error' => sprintf('Row %d: duplicate login ID "%s" in CSV', $rowNumber, $uniqueId)];
                        continue 2;
                    }
                }
            }

            $normalizedRows[] = [
                'row_number' => $rowNumber,
                'unique_user_id' => $uniqueId,
                'name' => $name,
                'email' => $email,
                'dept_name' => $deptName,
                'course_name' => $courseName,
                'year' => $year,
                'semester' => $semester,
                'section' => $section,
                'password' => $password !== '' ? $password : $defaultPassword,
            ];
        }

        if ($rowErrors) {
            json_response([
                'success' => false,
                'error' => 'Some student rows are invalid. Fix the CSV and try again.',
                'row_errors' => $rowErrors,
            ], 400);
        }

        // Phase 2: Insert valid rows in a transaction.
        // IMPORTANT: ensure_college_settings_table() runs a DDL statement (CREATE TABLE IF NOT EXISTS)
        // which MySQL treats as an implicit commit. Call it BEFORE beginTransaction() so that
        // it doesn't silently end the transaction and cause "There is no active transaction" errors
        // when generate_student_unique_id() is later called inside the transaction.
        ensure_college_settings_table($this->pdo);

        $this->pdo->beginTransaction();
        try {
            $insertedCount = 0;
            $skippedCount = 0;
            $skippedRows = [];
            $createdCredentials = [];

            $checkUniqueStmt = $this->pdo->prepare(
                'SELECT id FROM users WHERE unique_user_id = :uid AND college_id = :cid LIMIT 1'
            );
            $checkEmailStmt = $this->pdo->prepare(
                'SELECT id FROM users WHERE email = :email AND college_id = :cid AND email IS NOT NULL AND email != "" LIMIT 1'
            );

            foreach ($normalizedRows as $row) {
                // Resolve/create department
                $this->pdo->prepare('INSERT INTO departments (college_id, name, status) VALUES (:cid, :name, "active") ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), status = "active"')
                    ->execute([':cid' => $collegeId, ':name' => $row['dept_name']]);
                $deptId = (int)$this->pdo->lastInsertId();

                // Resolve/create course section
                $this->pdo->prepare('INSERT INTO courses_sections (dept_id, course_name, year, semester, section) VALUES (:dept, :course, :year, :semester, :section) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)')
                    ->execute([':dept' => $deptId, ':course' => $row['course_name'], ':year' => $row['year'], ':semester' => $row['semester'], ':section' => $row['section']]);

                // Generate unique ID if not provided
                $uniqueId = $row['unique_user_id'];
                if ($uniqueId === '') {
                    $uniqueId = generate_student_unique_id($this->pdo, $collegeId);
                }

                // Check for existing unique_user_id in DB
                $checkUniqueStmt->execute([':uid' => $uniqueId, ':cid' => $collegeId]);
                if ($checkUniqueStmt->fetch()) {
                    $skippedCount++;
                    $skippedRows[] = ['row' => $row['row_number'], 'reason' => sprintf('Login ID "%s" already exists', $uniqueId)];
                    continue;
                }

                // Check for duplicate email in DB
                if ($row['email'] !== '') {
                    $checkEmailStmt->execute([':email' => $row['email'], ':cid' => $collegeId]);
                    if ($checkEmailStmt->fetch()) {
                        $skippedCount++;
                        $skippedRows[] = ['row' => $row['row_number'], 'reason' => sprintf('Email "%s" already exists', $row['email'])];
                        continue;
                    }
                }

                // Insert user
                $hash = password_hash($row['password'], PASSWORD_DEFAULT);
                $this->pdo->prepare('INSERT INTO users (unique_user_id, college_id, name, email, password_hash, role, status) VALUES (:uid, :cid, :name, :email, :hash, "student", "active")')
                    ->execute([':uid' => $uniqueId, ':cid' => $collegeId, ':name' => $row['name'], ':email' => ($row['email'] === '' ? null : $row['email']), ':hash' => $hash]);
                $userId = (int)$this->pdo->lastInsertId();

                // Insert student record
                $this->pdo->prepare('INSERT INTO students (user_id, dept_id, course, year, semester, section, face_registered) VALUES (:uid, :dept, :course, :year, :semester, :section, 0)')
                    ->execute([':uid' => $userId, ':dept' => $deptId, ':course' => $row['course_name'], ':year' => $row['year'], ':semester' => $row['semester'], ':section' => $row['section']]);

                $insertedCount++;
                $createdCredentials[] = [
                    'unique_user_id' => $uniqueId,
                    'name' => $row['name'],
                    'password' => $row['password'],
                ];
            }

            $this->pdo->commit();
        } catch (Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        $this->audit->log($this->sessionCtx->currentUser['id'], 'college_admin_student_bulk_import', [
            'rows_received' => count($rowsInput),
            'inserted_count' => $insertedCount,
            'skipped_count' => $skippedCount,
        ]);

        json_response([
            'success' => true,
            'inserted_count' => $insertedCount,
            'skipped_count' => $skippedCount,
            'skipped_rows' => $skippedRows,
            'total_received' => count($rowsInput),
            'credentials' => $createdCredentials,
        ]);
    }

    public function facultyCreate(): void
    {
        Session::requireRole($this->sessionCtx, ['college_admin']);
        require_method('POST');
        $input = read_json_body();
        $collegeId = require_college_id($this->sessionCtx->currentUser);
        $uniqueId = trim((string)($input['unique_user_id'] ?? ''));
        $name = trim((string)($input['name'] ?? ''));
        $email = trim((string)($input['email'] ?? ''));
        $deptName = trim((string)($input['dept_name'] ?? 'General'));
        $designation = trim((string)($input['designation'] ?? 'Faculty'));
        $password = (string)($input['password'] ?? 'Faculty@123');
        if ($name === '') { json_response(['success' => false, 'error' => 'name is required'], 400); }

        $this->pdo->beginTransaction();
        try {
            $this->pdo->prepare('INSERT INTO departments (college_id, name, status) VALUES (:cid, :name, "active") ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), status = "active"')
                ->execute([':cid' => $collegeId, ':name' => $deptName]);
            $deptId = (int)$this->pdo->lastInsertId();

            if ($uniqueId === '') { $uniqueId = generate_faculty_unique_id($this->pdo, $collegeId); }

            $hash = password_hash($password, PASSWORD_DEFAULT);
            $this->pdo->prepare('INSERT INTO users (unique_user_id, college_id, name, email, password_hash, role, status) VALUES (:uid, :cid, :name, :email, :hash, "faculty", "active")')
                ->execute([':uid' => $uniqueId, ':cid' => $collegeId, ':name' => $name, ':email' => ($email === '' ? null : $email), ':hash' => $hash]);
            $userId = (int)$this->pdo->lastInsertId();

            $this->pdo->prepare('INSERT INTO faculty (user_id, dept_id, designation) VALUES (:uid, :dept, :designation)')
                ->execute([':uid' => $userId, ':dept' => $deptId, ':designation' => $designation]);
            $this->pdo->commit();
        } catch (Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        $this->audit->log($this->sessionCtx->currentUser['id'], 'college_admin_faculty_created', ['unique_user_id' => $uniqueId]);
        json_response(['success' => true, 'unique_user_id' => $uniqueId]);
    }

    public function settingsGet(): void
    {
        Session::requireRole($this->sessionCtx, ['college_admin']);
        $collegeId = require_college_id($this->sessionCtx->currentUser);
        ensure_college_settings_table($this->pdo);
        ensure_college_location_settings_table($this->pdo);

        $stmt = $this->pdo->prepare(
            'SELECT c.id, c.name, c.logo, c.contact,
                    cs.short_code, cs.contact_email, cs.contact_phone,
                    cls.latitude, cls.longitude, cls.radius_meters
             FROM colleges c
             LEFT JOIN college_settings cs ON cs.college_id = c.id
             LEFT JOIN college_location_settings cls ON cls.college_id = c.id
             WHERE c.id = :cid LIMIT 1'
        );
        $stmt->execute([':cid' => $collegeId]);
        $row = $stmt->fetch();
        if (!$row) { json_response(['success' => false, 'error' => 'College not found'], 404); }
        json_response(['success' => true, 'college' => $row]);
    }

    public function settingsSave(): void
    {
        Session::requireRole($this->sessionCtx, ['college_admin']);
        require_method('POST');
        $input = read_json_body();
        $collegeId = require_college_id($this->sessionCtx->currentUser);
        $name = trim((string)($input['name'] ?? ''));
        $shortCode = trim((string)($input['short_code'] ?? ''));
        $email = trim((string)($input['contact_email'] ?? ''));
        $phone = trim((string)($input['contact_phone'] ?? ''));
        $logoDataUrl = trim((string)($input['logo_image_data'] ?? ''));
        $hasLatKey = array_key_exists('latitude', $input);
        $hasLngKey = array_key_exists('longitude', $input);
        $hasRadiusKey = array_key_exists('radius_meters', $input);
        $latRaw = $hasLatKey ? trim((string)$input['latitude']) : '';
        $lngRaw = $hasLngKey ? trim((string)$input['longitude']) : '';
        $radiusRaw = $hasRadiusKey ? trim((string)$input['radius_meters']) : '';
        if ($name === '') { json_response(['success' => false, 'error' => 'College name is required'], 400); }

        $locationAction = 'noop';
        $locationLat = null; $locationLng = null; $locationRadius = null;
        $isLocationUpdateRequested = $hasLatKey || $hasLngKey || $hasRadiusKey;
        if ($isLocationUpdateRequested) {
            $latIsEmpty = $latRaw === '';
            $lngIsEmpty = $lngRaw === '';
            if ($latIsEmpty && $lngIsEmpty) { $locationAction = 'clear'; }
            elseif ($latIsEmpty || $lngIsEmpty) { json_response(['success' => false, 'error' => 'Both latitude and longitude are required (or leave both empty to disable).'], 400); }
            else {
                $locationAction = 'set';
                $locationLat = (float)$latRaw; $locationLng = (float)$lngRaw;
                $locationRadius = $radiusRaw === '' ? 200 : (int)$radiusRaw;
                if ($locationLat < -90.0 || $locationLat > 90.0) { json_response(['success' => false, 'error' => 'Latitude must be between -90 and 90'], 400); }
                if ($locationLng < -180.0 || $locationLng > 180.0) { json_response(['success' => false, 'error' => 'Longitude must be between -180 and 180'], 400); }
                if ($locationRadius <= 0) { $locationRadius = 200; }
            }
        }

        ensure_college_settings_table($this->pdo);
        ensure_college_location_settings_table($this->pdo);

        $stmt = $this->pdo->prepare('SELECT id, logo FROM colleges WHERE id = :cid LIMIT 1');
        $stmt->execute([':cid' => $collegeId]);
        $existingCollege = $stmt->fetch();
        if (!$existingCollege) { json_response(['success' => false, 'error' => 'College not found'], 404); }

        $newLogoPath = null;
        if ($logoDataUrl !== '') { $newLogoPath = save_college_logo_from_data_url($logoDataUrl, $collegeId); }

        if ($newLogoPath !== null) {
            $this->pdo->prepare('UPDATE colleges SET name = :name, contact = :contact, logo = :logo WHERE id = :cid')
                ->execute([':name' => $name, ':contact' => $email, ':logo' => $newLogoPath, ':cid' => $collegeId]);
        } else {
            $this->pdo->prepare('UPDATE colleges SET name = :name, contact = :contact WHERE id = :cid')
                ->execute([':name' => $name, ':contact' => $email, ':cid' => $collegeId]);
        }

        $this->pdo->prepare('INSERT INTO college_settings (college_id, short_code, contact_email, contact_phone) VALUES (:cid, :sc, :email, :phone) ON DUPLICATE KEY UPDATE short_code = VALUES(short_code), contact_email = VALUES(contact_email), contact_phone = VALUES(contact_phone)')
            ->execute([':cid' => $collegeId, ':sc' => ($shortCode === '' ? null : $shortCode), ':email' => ($email === '' ? null : $email), ':phone' => ($phone === '' ? null : $phone)]);

        $oldLogoPath = (string)($existingCollege['logo'] ?? '');
        if ($newLogoPath !== null && $oldLogoPath !== '' && $oldLogoPath !== $newLogoPath && str_starts_with($oldLogoPath, 'uploads/college_logos/')) {
            $oldAbs = dirname(__DIR__, 3) . '/' . $oldLogoPath;
            if (is_file($oldAbs)) { @unlink($oldAbs); }
        }

        if ($locationAction === 'clear') {
            $this->pdo->prepare('DELETE FROM college_location_settings WHERE college_id = :cid')->execute([':cid' => $collegeId]);
        } elseif ($locationAction === 'set') {
            $this->pdo->prepare('INSERT INTO college_location_settings (college_id, latitude, longitude, radius_meters) VALUES (:cid, :lat, :lng, :r) ON DUPLICATE KEY UPDATE latitude = VALUES(latitude), longitude = VALUES(longitude), radius_meters = VALUES(radius_meters)')
                ->execute([':cid' => $collegeId, ':lat' => $locationLat, ':lng' => $locationLng, ':r' => $locationRadius]);
        }

        $this->audit->log($this->sessionCtx->currentUser['id'], 'college_settings_saved', ['college_id' => $collegeId]);
        json_response([
            'success' => true,
            'college' => [
                'id' => $collegeId, 'name' => $name,
                'logo' => $newLogoPath ?? ($existingCollege['logo'] ?? null),
                'contact_email' => ($email === '' ? null : $email), 'contact_phone' => ($phone === '' ? null : $phone),
                'short_code' => ($shortCode === '' ? null : $shortCode),
                'latitude' => ($locationAction === 'set' ? $locationLat : null),
                'longitude' => ($locationAction === 'set' ? $locationLng : null),
                'radius_meters' => ($locationAction === 'set' ? $locationRadius : null),
            ],
        ]);
    }

    public function noticesList(): void
    {
        Session::requireRole($this->sessionCtx, ['college_admin', 'faculty', 'student']);
        $collegeId = require_college_id($this->sessionCtx->currentUser);
        $role = (string)($this->sessionCtx->currentUser['role'] ?? '');
        $includeArchived = isset($_GET['include_archived']) ? (int)$_GET['include_archived'] : 0;
        $includeExpired = isset($_GET['include_expired']) ? (int)$_GET['include_expired'] : 0;

        ensure_college_notices_table($this->pdo);

        $where = ['n.college_id = :cid'];
        $params = [':cid' => $collegeId];
        if (!($role === 'college_admin' && $includeArchived === 1)) { $where[] = 'n.archived_at IS NULL'; }
        if (!($role === 'college_admin' && $includeExpired === 1)) { $where[] = '(n.expires_at IS NULL OR n.expires_at > NOW())'; }
        if ($role === 'student') { $where[] = "n.audience IN ('all','students')"; }
        elseif ($role === 'faculty') { $where[] = "n.audience IN ('all','faculty')"; }

        $sql = 'SELECT n.id, n.title, n.message, n.audience, n.created_at, n.expires_at, n.archived_at, n.created_by_user_id, u.name AS created_by_name FROM college_notices n LEFT JOIN users u ON u.id = n.created_by_user_id WHERE ' . implode(' AND ', $where) . ' ORDER BY n.created_at DESC, n.id DESC';
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        json_response(['success' => true, 'notices' => $stmt->fetchAll()]);
    }

    public function noticeCreate(): void
    {
        Session::requireRole($this->sessionCtx, ['college_admin']);
        require_method('POST');
        $input = read_json_body();
        $collegeId = require_college_id($this->sessionCtx->currentUser);
        $title = trim((string)($input['title'] ?? ''));
        $message = trim((string)($input['message'] ?? ''));
        $audience = trim((string)($input['audience'] ?? 'all'));
        $expiresRaw = trim((string)($input['expires_at'] ?? ''));

        if ($title === '' || $message === '') { json_response(['success' => false, 'error' => 'title and message are required'], 400); }
        if (!in_array($audience, ['all', 'students', 'faculty'], true)) { json_response(['success' => false, 'error' => 'Invalid audience'], 400); }

        $expiresAt = null;
        if ($expiresRaw !== '') {
            $ts = strtotime($expiresRaw);
            if ($ts === false) { json_response(['success' => false, 'error' => 'Invalid expires_at'], 400); }
            $expiresAt = date('Y-m-d H:i:s', $ts);
        }

        ensure_college_notices_table($this->pdo);
        $stmt = $this->pdo->prepare('INSERT INTO college_notices (college_id, title, message, audience, created_by_user_id, expires_at) VALUES (:cid, :title, :message, :audience, :uid, :expires_at)');
        $stmt->execute([':cid' => $collegeId, ':title' => $title, ':message' => $message, ':audience' => $audience, ':uid' => (int)$this->sessionCtx->currentUser['id'], ':expires_at' => $expiresAt]);
        $noticeId = (int)$this->pdo->lastInsertId();

        $this->audit->log($this->sessionCtx->currentUser['id'], 'college_notice_created', ['notice_id' => $noticeId, 'audience' => $audience]);
        json_response(['success' => true, 'notice_id' => $noticeId]);
    }

    public function noticeArchive(): void
    {
        Session::requireRole($this->sessionCtx, ['college_admin']);
        require_method('POST');
        $input = read_json_body();
        $collegeId = require_college_id($this->sessionCtx->currentUser);
        $noticeId = isset($input['notice_id']) ? (int)$input['notice_id'] : 0;
        if ($noticeId <= 0) { json_response(['success' => false, 'error' => 'notice_id is required'], 400); }

        ensure_college_notices_table($this->pdo);
        $stmt = $this->pdo->prepare('UPDATE college_notices SET archived_at = NOW() WHERE id = :id AND college_id = :cid AND archived_at IS NULL');
        $stmt->execute([':id' => $noticeId, ':cid' => $collegeId]);
        if ($stmt->rowCount() === 0) { json_response(['success' => false, 'error' => 'Notice not found or already archived'], 404); }

        $this->audit->log($this->sessionCtx->currentUser['id'], 'college_notice_archived', ['notice_id' => $noticeId]);
        json_response(['success' => true]);
    }

    public function generateUniqueId(): void
    {
        Session::requireRole($this->sessionCtx, ['college_admin']);
        require_method('POST');
        $input = read_json_body();
        $roleType = trim((string)($input['role'] ?? ''));
        $collegeId = require_college_id($this->sessionCtx->currentUser);
        if (!in_array($roleType, ['student', 'faculty'], true)) { json_response(['success' => false, 'error' => 'Invalid role type. Must be faculty or student'], 400); }

        try {
            $newId = $roleType === 'faculty' ? generate_faculty_unique_id($this->pdo, $collegeId) : generate_student_unique_id($this->pdo, $collegeId);
            $this->audit->log($this->sessionCtx->currentUser['id'], 'college_admin_unique_id_generated', ['role' => $roleType, 'unique_user_id' => $newId]);
            json_response(['success' => true, 'unique_id' => $newId]);
        } catch (Throwable $e) {
            json_response(['success' => false, 'error' => 'Failed: ' . $e->getMessage()], 500);
        }
    }

    public function dashboardSummary(): void
    {
        Session::requireRole($this->sessionCtx, ['college_admin']);
        $collegeId = require_college_id($this->sessionCtx->currentUser);

        $s = $this->pdo->prepare("SELECT COUNT(*) AS c FROM users WHERE college_id = :cid AND role = 'student' AND deleted_at IS NULL");
        $s->execute([':cid' => $collegeId]);
        $totalStudents = (int)($s->fetch()['c'] ?? 0);

        $s = $this->pdo->prepare("SELECT COUNT(*) AS c FROM users WHERE college_id = :cid AND role = 'faculty' AND deleted_at IS NULL");
        $s->execute([':cid' => $collegeId]);
        $totalFaculty = (int)($s->fetch()['c'] ?? 0);

        $s = $this->pdo->prepare('SELECT COUNT(*) AS c FROM departments WHERE college_id = :cid AND status = "active"');
        $s->execute([':cid' => $collegeId]);
        $departmentsCount = (int)($s->fetch()['c'] ?? 0);

        $overallSummary = $this->calculateAttendanceSummary($collegeId);
        $avgAttendance = (float)$overallSummary['percent'];

        $today = (new DateTimeImmutable('today'))->format('Y-m-d');
        $todaySummary = $this->calculateAttendanceSummary($collegeId, $today, $today);

        // Daily attendance trend (last 7 days, percentage-based)
        $trends = [];
        for ($i = 6; $i >= 0; $i--) {
            $date = (new DateTimeImmutable("-{$i} days"))->format('Y-m-d');
            $summary = $this->calculateAttendanceSummary($collegeId, $date, $date);
            $trends[] = [
                'date' => $date,
                'count' => (int)$summary['present_count'],
                'eligible_count' => (int)$summary['eligible_count'],
                'percent' => (float)$summary['percent'],
            ];
        }

        // Monthly report (last 6 months)
        $monthlyReport = [];
        $currentMonthStart = new DateTimeImmutable('first day of this month');
        for ($i = 5; $i >= 0; $i--) {
            $month = $currentMonthStart->modify("-{$i} months");
            $monthStart = $month->format('Y-m-d');
            $monthEnd = $month->modify('last day of this month')->format('Y-m-d');
            $summary = $this->calculateAttendanceSummary($collegeId, $monthStart, $monthEnd);
            $monthlyReport[] = [
                'month' => $month->format('M Y'),
                'present_count' => (int)$summary['present_count'],
                'eligible_count' => (int)$summary['eligible_count'],
                'percent' => (float)$summary['percent'],
            ];
        }

        $lowAttendanceStudents = $this->getLowAttendanceStudents($collegeId, 75.0, 8);
        $lowAttendanceCount = $this->getLowAttendanceStudentCount($collegeId, 75.0);

        $activityStmt = $this->pdo->prepare('SELECT a.timestamp, a.action, u.name FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id WHERE u.college_id = :cid ORDER BY a.timestamp DESC LIMIT 8');
        $activityStmt->execute([':cid' => $collegeId]);

        json_response([
            'success' => true,
            'stats' => [
                'total_students' => $totalStudents, 
                'total_faculty' => $totalFaculty, 
                'departments_count' => $departmentsCount, 
                'avg_attendance' => $avgAttendance,
                'daily_attendance_pct' => (float)$todaySummary['percent'],
                'low_attendance_count' => $lowAttendanceCount,
            ],
            'charts' => [
                'daily_attendance_trend' => $trends,
                'monthly_report' => $monthlyReport,
            ],
            'low_attendance_students' => $lowAttendanceStudents,
            'recent_activity' => $activityStmt->fetchAll(),
        ]);
    }

    private function calculateAttendanceSummary(int $collegeId, ?string $fromDate = null, ?string $toDate = null): array
    {
        $sql = 'SELECT s.id, cs.dept_id, cs.year, cs.semester, cs.section
                FROM attendance_sessions s
                JOIN courses_sections cs ON cs.id = s.course_id
                WHERE s.college_id = :cid
                  AND s.status IN ("active","closed")';
        $params = [':cid' => $collegeId];

        if ($fromDate !== null) {
            $sql .= ' AND DATE(s.start_time) >= :from_date';
            $params[':from_date'] = $fromDate;
        }
        if ($toDate !== null) {
            $sql .= ' AND DATE(s.start_time) <= :to_date';
            $params[':to_date'] = $toDate;
        }

        $sessionsStmt = $this->pdo->prepare($sql);
        $sessionsStmt->execute($params);
        $sessions = $sessionsStmt->fetchAll();

        $presentTotal = 0;
        $eligibleTotal = 0;
        $presentStmt = $this->pdo->prepare("SELECT COUNT(*) AS c FROM attendance_records WHERE session_id = :sid AND status = 'present'");
        $classSizeStmt = $this->pdo->prepare(
            'SELECT COUNT(*) AS c
             FROM students s
             JOIN users u ON u.id = s.user_id
             WHERE s.dept_id = :dept
               AND s.year = :year
               AND s.semester = :semester
               AND s.section = :section
               AND u.college_id = :cid
               AND u.role = "student"
               AND u.deleted_at IS NULL'
        );

        foreach ($sessions as $session) {
            $presentStmt->execute([':sid' => (int)$session['id']]);
            $presentTotal += (int)($presentStmt->fetch()['c'] ?? 0);

            $classSizeStmt->execute([
                ':dept' => (int)$session['dept_id'],
                ':year' => (int)$session['year'],
                ':semester' => (int)$session['semester'],
                ':section' => (string)$session['section'],
                ':cid' => $collegeId,
            ]);
            $eligibleTotal += (int)($classSizeStmt->fetch()['c'] ?? 0);
        }

        return [
            'present_count' => $presentTotal,
            'eligible_count' => $eligibleTotal,
            'percent' => $eligibleTotal > 0 ? round(($presentTotal / $eligibleTotal) * 100, 2) : 0.0,
        ];
    }

    private function getLowAttendanceStudents(int $collegeId, float $threshold = 75.0, int $limit = 8): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT
                u.unique_user_id,
                u.name,
                d.name AS dept_name,
                s.year,
                s.semester,
                s.section,
                COALESCE(p.present_count, 0) AS present_count,
                COALESCE(t.total_sessions, 0) AS total_sessions,
                CASE
                    WHEN COALESCE(t.total_sessions, 0) = 0 THEN 0
                    ELSE ROUND((COALESCE(p.present_count, 0) / t.total_sessions) * 100, 2)
                END AS attendance_percent
             FROM students s
             JOIN users u ON u.id = s.user_id
             LEFT JOIN departments d ON d.id = s.dept_id
             LEFT JOIN (
                SELECT
                    cs.dept_id,
                    cs.year,
                    cs.semester,
                    cs.section,
                    COUNT(*) AS total_sessions
                FROM attendance_sessions sess
                JOIN courses_sections cs ON cs.id = sess.course_id
                WHERE sess.college_id = :cid_total
                  AND sess.status IN ("active","closed")
                GROUP BY cs.dept_id, cs.year, cs.semester, cs.section
             ) t
               ON t.dept_id = s.dept_id
              AND t.year = s.year
              AND t.semester = s.semester
              AND t.section = s.section
             LEFT JOIN (
                SELECT ar.student_id, COUNT(*) AS present_count
                FROM attendance_records ar
                JOIN attendance_sessions sess ON sess.id = ar.session_id
                WHERE sess.college_id = :cid_present
                  AND ar.status = "present"
                GROUP BY ar.student_id
             ) p ON p.student_id = s.student_id
             WHERE u.college_id = :cid_users
               AND u.role = "student"
               AND u.deleted_at IS NULL
               AND COALESCE(t.total_sessions, 0) > 0
             HAVING attendance_percent < :threshold
             ORDER BY attendance_percent ASC, total_sessions DESC, u.name ASC
             LIMIT ' . (int)$limit
        );
        $stmt->execute([
            ':cid_total' => $collegeId,
            ':cid_present' => $collegeId,
            ':cid_users' => $collegeId,
            ':threshold' => $threshold,
        ]);

        return array_map(static function (array $row): array {
            return [
                'unique_user_id' => $row['unique_user_id'],
                'name' => $row['name'],
                'dept_name' => $row['dept_name'],
                'year' => isset($row['year']) ? (int)$row['year'] : null,
                'semester' => isset($row['semester']) ? (int)$row['semester'] : null,
                'section' => $row['section'],
                'present_count' => (int)($row['present_count'] ?? 0),
                'total_sessions' => (int)($row['total_sessions'] ?? 0),
                'attendance_percent' => (float)($row['attendance_percent'] ?? 0),
            ];
        }, $stmt->fetchAll());
    }

    private function getLowAttendanceStudentCount(int $collegeId, float $threshold = 75.0): int
    {
        $stmt = $this->pdo->prepare(
            'SELECT COUNT(*) AS c
             FROM (
                SELECT
                    CASE
                        WHEN COALESCE(t.total_sessions, 0) = 0 THEN 0
                        ELSE ROUND((COALESCE(p.present_count, 0) / t.total_sessions) * 100, 2)
                    END AS attendance_percent
                FROM students s
                JOIN users u ON u.id = s.user_id
                LEFT JOIN (
                    SELECT
                        cs.dept_id,
                        cs.year,
                        cs.semester,
                        cs.section,
                        COUNT(*) AS total_sessions
                    FROM attendance_sessions sess
                    JOIN courses_sections cs ON cs.id = sess.course_id
                    WHERE sess.college_id = :cid_total
                      AND sess.status IN ("active","closed")
                    GROUP BY cs.dept_id, cs.year, cs.semester, cs.section
                ) t
                  ON t.dept_id = s.dept_id
                 AND t.year = s.year
                 AND t.semester = s.semester
                 AND t.section = s.section
                LEFT JOIN (
                    SELECT ar.student_id, COUNT(*) AS present_count
                    FROM attendance_records ar
                    JOIN attendance_sessions sess ON sess.id = ar.session_id
                    WHERE sess.college_id = :cid_present
                      AND ar.status = "present"
                    GROUP BY ar.student_id
                ) p ON p.student_id = s.student_id
                WHERE u.college_id = :cid_users
                  AND u.role = "student"
                  AND u.deleted_at IS NULL
                  AND COALESCE(t.total_sessions, 0) > 0
             ) low_students
             WHERE attendance_percent < :threshold'
        );
        $stmt->execute([
            ':cid_total' => $collegeId,
            ':cid_present' => $collegeId,
            ':cid_users' => $collegeId,
            ':threshold' => $threshold,
        ]);

        return (int)($stmt->fetch()['c'] ?? 0);
    }
}
