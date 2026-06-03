<?php
/**
 * Shared helpers, constants, migration functions, and utilities.
 * Extracted from the monolithic api.php during refactoring.
 */

// ---- Face verification constants ----
const FACE_MAX_ATTEMPTS           = 3;
const FACE_MONTHLY_UPDATE_LIMIT   = 2;

// ---- HTTP/JSON helpers ----

function json_response(array $data, int $statusCode = 200): void
{
    http_response_code($statusCode);
    echo json_encode($data);
    exit;
}

function require_method(string $method): void
{
    if ($_SERVER['REQUEST_METHOD'] !== $method) {
        json_response(['success' => false, 'error' => 'Method not allowed'], 405);
    }
}

function read_json_body(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        return [];
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function require_college_id(array $user): int
{
    $collegeId = isset($user['college_id']) ? (int)$user['college_id'] : 0;
    if ($collegeId <= 0) {
        json_response(['success' => false, 'error' => 'No college assigned to your account. Ask super admin to assign a college.'], 400);
    }
    return $collegeId;
}

// ---- Face / embedding helpers ----

function normalize_embedding_vector($vector): ?array
{
    if (!is_array($vector)) {
        return null;
    }
    if (count($vector) !== 128) {
        return null;
    }
    $normalized = [];
    foreach ($vector as $value) {
        if (!is_numeric($value)) {
            return null;
        }
        $normalized[] = (float)$value;
    }
    return $normalized;
}

// ---- DB column / schema helpers ----

function column_exists(PDO $pdo, string $table, string $column): bool
{
    try {
        $stmt = $pdo->prepare('SHOW COLUMNS FROM `' . $table . '` LIKE :col');
        $stmt->execute([':col' => $column]);
        return (bool)$stmt->fetch();
    } catch (Throwable $e) {
        return false;
    }
}

function table_exists(PDO $pdo, string $table): bool
{
    try {
        $stmt = $pdo->query('SHOW TABLES LIKE ' . $pdo->quote($table));
        return (bool)$stmt->fetchColumn();
    } catch (Throwable $e) {
        return false;
    }
}

function split_sql_statements(string $sql): array
{
    $sql = preg_replace('/^\s*--.*$/m', '', $sql) ?? $sql;
    $parts = preg_split('/;\s*(?:\r?\n|$)/', $sql) ?: [];
    $statements = [];
    foreach ($parts as $part) {
        $statement = trim($part);
        if ($statement !== '') {
            $statements[] = $statement;
        }
    }
    return $statements;
}

function ensure_base_schema_loaded(PDO $pdo): void
{
    static $checked = false;
    if ($checked) {
        return;
    }
    $checked = true;

    $requiredTables = ['users', 'colleges', 'students', 'departments', 'attendance_sessions'];
    $missing = [];
    foreach ($requiredTables as $table) {
        if (!table_exists($pdo, $table)) {
            $missing[] = $table;
        }
    }

    if (empty($missing)) {
        return;
    }

    // Only auto-bootstrap a brand-new database. For partially imported DBs we
    // leave the schema untouched and surface a clearer error downstream.
    if (count($missing) !== count($requiredTables)) {
        error_log('base schema bootstrap skipped because the database is only partially initialized. Missing tables: ' . implode(', ', $missing));
        return;
    }

    $schemaPath = dirname(__DIR__, 2) . '/schema.sql';
    $schemaSql = @file_get_contents($schemaPath);
    if ($schemaSql === false || trim($schemaSql) === '') {
        throw new RuntimeException('Database bootstrap failed: schema.sql could not be loaded.');
    }

    foreach (split_sql_statements($schemaSql) as $statement) {
        try {
            $pdo->exec($statement);
        } catch (PDOException $e) {
            $message = strtolower($e->getMessage());
            if (str_contains($message, 'already exists')) {
                continue;
            }

            throw new RuntimeException(
                'Database bootstrap failed while creating the base schema. Import schema.sql manually or grant CREATE/ALTER privileges. Last error: ' . $e->getMessage(),
                0,
                $e
            );
        }
    }

    error_log('base schema bootstrap completed using schema.sql');
}

function find_student_record_by_user(PDO $pdo, int $userId, int $collegeId): ?array
{
    if ($userId <= 0 || $collegeId <= 0) {
        return null;
    }

    $stmt = $pdo->prepare(
        'SELECT s.student_id, s.user_id, s.dept_id, s.course, s.year, s.semester, s.section, s.face_registered,
                d.name AS dept_name, d.college_id AS dept_college_id
         FROM students s
         JOIN users u ON u.id = s.user_id
         LEFT JOIN departments d ON d.id = s.dept_id
         WHERE s.user_id = :uid AND u.college_id = :college_id
         LIMIT 1'
    );
    $stmt->execute([
        ':uid' => $userId,
        ':college_id' => $collegeId,
    ]);

    $student = $stmt->fetch();
    if (!$student) {
        return null;
    }

    $deptCollegeId = isset($student['dept_college_id']) ? (int)$student['dept_college_id'] : 0;
    if ($deptCollegeId > 0 && $deptCollegeId !== $collegeId) {
        error_log(sprintf(
            'student/department college mismatch detected for user_id=%d student_id=%d user_college=%d dept_college=%d',
            $userId,
            (int)($student['student_id'] ?? 0),
            $collegeId,
            $deptCollegeId
        ));
    }

    return $student;
}

function has_users_profile_photo_path_column(PDO $pdo): bool
{
    static $cached = null;
    if ($cached !== null) {
        return $cached;
    }
    try {
        $stmt = $pdo->query("SHOW COLUMNS FROM users LIKE 'profile_photo_path'");
        $cached = (bool)$stmt->fetch();
    } catch (Throwable $e) {
        $cached = false;
    }
    return $cached;
}

function has_users_profile_photo_data_column(PDO $pdo): bool
{
    static $cached = null;
    if ($cached !== null) {
        return $cached;
    }
    try {
        $stmt = $pdo->query("SHOW COLUMNS FROM users LIKE 'profile_photo_data'");
        $cached = (bool)$stmt->fetch();
    } catch (Throwable $e) {
        $cached = false;
    }
    return $cached;
}

// ---- Lazy migration functions ----

function ensure_users_profile_photo_columns(PDO $pdo): void
{
    if (!has_users_profile_photo_path_column($pdo)) {
        $pdo->exec('ALTER TABLE users ADD COLUMN profile_photo_path VARCHAR(255) NULL AFTER email');
    }
    if (!has_users_profile_photo_data_column($pdo)) {
        $pdo->exec('ALTER TABLE users ADD COLUMN profile_photo_data LONGTEXT NULL AFTER profile_photo_path');
    }
}

function ensure_academic_semester_columns(PDO $pdo): void
{
    try {
        if (!column_exists($pdo, 'courses_sections', 'semester')) {
            $pdo->exec('ALTER TABLE courses_sections ADD COLUMN semester TINYINT UNSIGNED NOT NULL DEFAULT 1 AFTER year');
            $pdo->exec('UPDATE courses_sections SET semester = GREATEST(1, LEAST(8, (year * 2) - 1)) WHERE semester IS NULL OR semester = 0');
        }
    } catch (Throwable $e) {
        error_log('semester migration (courses_sections) skipped: ' . $e->getMessage());
    }
    try {
        if (!column_exists($pdo, 'students', 'semester')) {
            $pdo->exec('ALTER TABLE students ADD COLUMN semester TINYINT UNSIGNED NOT NULL DEFAULT 1 AFTER year');
            $pdo->exec('UPDATE students SET semester = GREATEST(1, LEAST(8, (year * 2) - 1)) WHERE semester IS NULL OR semester = 0');
        }
    } catch (Throwable $e) {
        error_log('semester migration (students) skipped: ' . $e->getMessage());
    }
    try {
        $idxStmt = $pdo->query("SHOW INDEX FROM courses_sections WHERE Key_name = 'uq_courses_sections'");
        $cols = [];
        foreach ($idxStmt->fetchAll() as $idx) {
            $cols[(int)$idx['Seq_in_index']] = (string)$idx['Column_name'];
        }
        ksort($cols);
        $signature = implode(',', $cols);
        if ($signature !== 'dept_id,course_name,year,semester,section') {
            $pdo->exec('ALTER TABLE courses_sections DROP INDEX uq_courses_sections');
            $pdo->exec('ALTER TABLE courses_sections ADD UNIQUE KEY uq_courses_sections (dept_id, course_name, year, semester, section)');
        }
    } catch (Throwable $e) {
        // Ignore index migration issues and keep API usable.
    }
}

function ensure_attendance_session_extra_reason_column(PDO $pdo): void
{
    try {
        if (!column_exists($pdo, 'attendance_sessions', 'extra_reason')) {
            $pdo->exec('ALTER TABLE attendance_sessions ADD COLUMN extra_reason VARCHAR(255) NULL AFTER subject');
        }
    } catch (Throwable $e) {
        error_log('attendance_sessions migration (extra_reason) skipped: ' . $e->getMessage());
    }
}

function ensure_users_deleted_at_column(PDO $pdo): void
{
    try {
        if (!column_exists($pdo, 'users', 'deleted_at')) {
            $pdo->exec('ALTER TABLE users ADD COLUMN deleted_at DATETIME NULL AFTER status');
        }
    } catch (Throwable $e) {
        error_log('users migration (deleted_at) skipped: ' . $e->getMessage());
    }
}

function ensure_auto_increment_primary_keys(PDO $pdo): void
{
    $targets = [
        'attendance_records' => 'id',
        'attendance_sessions' => 'id',
        'audit_logs' => 'id',
        'colleges' => 'id',
        'college_notices' => 'id',
        'courses_sections' => 'id',
        'course_subjects' => 'id',
        'departments' => 'id',
        'face_embeddings' => 'id',
        'face_registration_updates' => 'id',
        'face_verification_attempts' => 'id',
        'faculty' => 'faculty_id',
        'otp_logs' => 'id',
        'password_resets' => 'id',
        'students' => 'student_id',
        'timetable' => 'id',
        'users' => 'id',
    ];

    foreach ($targets as $table => $column) {
        try {
            $stmt = $pdo->query("SHOW COLUMNS FROM `{$table}` LIKE '{$column}'");
            $col = $stmt ? $stmt->fetch() : null;
            if (!is_array($col)) {
                continue;
            }

            $extra = strtolower((string)($col['Extra'] ?? ''));
            if (strpos($extra, 'auto_increment') !== false) {
                continue;
            }

            $key = strtoupper((string)($col['Key'] ?? ''));
            if ($key !== 'PRI') {
                error_log("auto_increment repair skipped for {$table}.{$column}: column is not a primary key");
                continue;
            }

            $colType = (string)($col['Type'] ?? 'bigint(20) unsigned');
            $pdo->exec("ALTER TABLE `{$table}` MODIFY `{$column}` {$colType} NOT NULL AUTO_INCREMENT");
            error_log("auto_increment repair: added AUTO_INCREMENT to {$table}.{$column}");
        } catch (Throwable $e) {
            error_log("auto_increment repair skipped for {$table}.{$column}: " . $e->getMessage());
        }
    }
}

function ensure_users_id_auto_increment(PDO $pdo): void
{
    try {
        $stmt = $pdo->query("SHOW COLUMNS FROM users LIKE 'id'");
        $col = $stmt ? $stmt->fetch() : null;
        if (is_array($col)) {
            $extra = strtolower((string)($col['Extra'] ?? ''));
            if (strpos($extra, 'auto_increment') === false) {
                $colType = (string)($col['Type'] ?? 'bigint(20) unsigned');
                $pdo->exec("ALTER TABLE users MODIFY `id` {$colType} NOT NULL AUTO_INCREMENT");
                error_log('users migration: added AUTO_INCREMENT to id column');
            }
        }
    } catch (Throwable $e) {
        error_log('users migration (id auto_increment) skipped: ' . $e->getMessage());
    }
}

function ensure_students_auto_increment(PDO $pdo): void
{
    // Fix: Ensure students.student_id has AUTO_INCREMENT (prevents 'Duplicate entry 0' errors)
    try {
        $stmt = $pdo->query("SHOW COLUMNS FROM students LIKE 'student_id'");
        $col = $stmt ? $stmt->fetch() : null;
        if (is_array($col)) {
            $extra = strtolower((string)($col['Extra'] ?? ''));
            if (strpos($extra, 'auto_increment') === false) {
                $colType = (string)($col['Type'] ?? 'bigint(20) unsigned');
                $pdo->exec("ALTER TABLE students MODIFY `student_id` {$colType} NOT NULL AUTO_INCREMENT");
                error_log('students migration: added AUTO_INCREMENT to student_id column');
            }
        }
    } catch (Throwable $e) {
        error_log('students migration (student_id auto_increment) skipped: ' . $e->getMessage());
    }
}

function ensure_colleges_archive_support(PDO $pdo): void
{
    // Fix: Ensure colleges.id has AUTO_INCREMENT (prevents 'Duplicate entry 0' errors)
    try {
        $stmt = $pdo->query("SHOW COLUMNS FROM colleges LIKE 'id'");
        $col = $stmt ? $stmt->fetch() : null;
        if (is_array($col)) {
            $extra = strtolower((string)($col['Extra'] ?? ''));
            if (strpos($extra, 'auto_increment') === false) {
                $colType = (string)($col['Type'] ?? 'bigint(20) unsigned');
                $pdo->exec("ALTER TABLE colleges MODIFY `id` {$colType} NOT NULL AUTO_INCREMENT");
                error_log('colleges migration: added AUTO_INCREMENT to id column');
            }
        }
    } catch (Throwable $e) {
        error_log('colleges migration (auto_increment) skipped: ' . $e->getMessage());
    }

    try {
        if (!column_exists($pdo, 'colleges', 'archived_at')) {
            $pdo->exec('ALTER TABLE colleges ADD COLUMN archived_at DATETIME NULL AFTER created_at');
        }
    } catch (Throwable $e) {
        error_log('colleges migration (archived_at) skipped: ' . $e->getMessage());
    }
    try {
        $stmt = $pdo->query("SHOW COLUMNS FROM colleges LIKE 'status'");
        $col = $stmt ? $stmt->fetch() : null;
        $type = is_array($col) ? (string)($col['Type'] ?? '') : '';
        if ($type !== '' && stripos($type, "'removed'") === false) {
            $pdo->exec("ALTER TABLE colleges MODIFY status ENUM('active','inactive','removed') NOT NULL DEFAULT 'active'");
        }
    } catch (Throwable $e) {
        error_log('colleges migration (status removed) skipped: ' . $e->getMessage());
    }
}

function ensure_departments_status_column(PDO $pdo): void
{
    try {
        if (!column_exists($pdo, 'departments', 'status')) {
            $pdo->exec("ALTER TABLE departments ADD COLUMN status ENUM('active','inactive') NOT NULL DEFAULT 'active' AFTER name");
            $pdo->exec("UPDATE departments SET status = 'active' WHERE status IS NULL OR status = ''");
        }
    } catch (Throwable $e) {
        error_log('departments migration (status) skipped: ' . $e->getMessage());
    }
}

function ensure_course_subjects_table(PDO $pdo): void
{
    try {
        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS course_subjects (
                id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                course_id BIGINT UNSIGNED NOT NULL,
                subject_name VARCHAR(255) NOT NULL,
                subject_code VARCHAR(64) NOT NULL,
                UNIQUE KEY uq_course_subject_code (course_id, subject_code),
                UNIQUE KEY uq_course_subject_name (course_id, subject_name),
                CONSTRAINT fk_course_subjects_course FOREIGN KEY (course_id) REFERENCES courses_sections(id)
                    ON DELETE CASCADE ON UPDATE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );
    } catch (Throwable $e) {
        error_log('course_subjects table ensure skipped: ' . $e->getMessage());
    }
}

function ensure_user_profiles_table(PDO $pdo): void
{
    try {
        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS user_profiles (
                user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
                phone VARCHAR(50) NULL,
                hobbies TEXT NULL,
                department_info TEXT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                CONSTRAINT fk_user_profiles_user FOREIGN KEY (user_id) REFERENCES users(id)
                    ON DELETE CASCADE ON UPDATE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );
    } catch (Throwable $e) {
        error_log('user_profiles table ensure skipped: ' . $e->getMessage());
    }
}

function ensure_face_verification_tables(PDO $pdo): void
{
    // face_embeddings table
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS face_embeddings (
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            student_id BIGINT UNSIGNED NOT NULL,
            embedding_vector LONGTEXT NOT NULL,
            embedding_type ENUM("front","left","right","up","down","neutral","glasses") DEFAULT "front",
            quality_score DECIMAL(5,2) NULL,
            registered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            KEY idx_face_embeddings_student (student_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );

    // face_verification_attempts table
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS face_verification_attempts (
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            session_id BIGINT UNSIGNED NOT NULL,
            student_id BIGINT UNSIGNED NOT NULL,
            attempts_used TINYINT UNSIGNED NOT NULL DEFAULT 0,
            last_match_score DECIMAL(5,2) NULL,
            last_decision VARCHAR(16) NULL,
            locked TINYINT(1) NOT NULL DEFAULT 0,
            locked_reason VARCHAR(255) NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_face_attempt_session_student (session_id, student_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );

    // Check for locked_reason column in face_verification_attempts if table already existed
    if (!column_exists($pdo, 'face_verification_attempts', 'locked_reason')) {
        try {
            $pdo->exec('ALTER TABLE face_verification_attempts ADD COLUMN locked_reason VARCHAR(255) NULL AFTER locked');
        } catch (Throwable $e) { /* ignore if already exists */ }
    }
}

function ensure_face_registration_updates_table(PDO $pdo): void
{
    try {
        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS face_registration_updates (
                id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                student_id BIGINT UNSIGNED NOT NULL,
                action ENUM("register","update") NOT NULL DEFAULT "update",
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                KEY idx_face_reg_updates_student_created (student_id, created_at),
                KEY idx_face_reg_updates_action_created (action, created_at),
                CONSTRAINT fk_face_reg_updates_student FOREIGN KEY (student_id) REFERENCES students(student_id)
                    ON DELETE CASCADE ON UPDATE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );
        return;
    } catch (Throwable $e) {
        // Fall through to FK-less version for compatibility.
    }

    try {
        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS face_registration_updates (
                id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                student_id BIGINT UNSIGNED NOT NULL,
                action ENUM("register","update") NOT NULL DEFAULT "update",
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                KEY idx_face_reg_updates_student_created (student_id, created_at),
                KEY idx_face_reg_updates_action_created (action, created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );
    } catch (Throwable $e) {
        error_log('face_registration_updates table ensure skipped: ' . $e->getMessage());
    }
}

function ensure_college_location_settings_table(PDO $pdo): void
{
    try {
        $pdo->exec('CREATE TABLE IF NOT EXISTS college_location_settings (
            college_id BIGINT UNSIGNED PRIMARY KEY,
            latitude DECIMAL(10,8) NOT NULL,
            longitude DECIMAL(10,8) NOT NULL,
            radius_meters INT UNSIGNED NOT NULL DEFAULT 200,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            CONSTRAINT fk_college_location_settings FOREIGN KEY (college_id) REFERENCES colleges(id)
                ON DELETE CASCADE ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
        return;
    } catch (Throwable $e) {
        // Fall through to more compatible definition.
    }
    try {
        $typeStmt = $pdo->query(
            "SELECT COLUMN_TYPE
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'colleges'
               AND COLUMN_NAME = 'id'
             LIMIT 1"
        );
        $colType = (string)($typeStmt->fetch()['COLUMN_TYPE'] ?? '');
        if ($colType === '') {
            $colType = 'BIGINT UNSIGNED';
        }
        $pdo->exec('CREATE TABLE IF NOT EXISTS college_location_settings (
            college_id ' . $colType . ' NOT NULL,
            latitude DECIMAL(10,8) NOT NULL,
            longitude DECIMAL(10,8) NOT NULL,
            radius_meters INT UNSIGNED NOT NULL DEFAULT 200,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (college_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
        $fkStmt = $pdo->query(
            "SELECT 1
             FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'college_location_settings'
               AND CONSTRAINT_TYPE = 'FOREIGN KEY'
               AND CONSTRAINT_NAME = 'fk_college_location_settings'
             LIMIT 1"
        );
        $hasFk = (bool)$fkStmt->fetch();
        if (!$hasFk) {
            $pdo->exec(
                'ALTER TABLE college_location_settings
                 ADD CONSTRAINT fk_college_location_settings
                 FOREIGN KEY (college_id) REFERENCES colleges(id)
                 ON DELETE CASCADE ON UPDATE CASCADE'
            );
        }
    } catch (Throwable $e) {
        // Keep API usable even if FK/table creation fails.
    }
}

function ensure_college_settings_table(PDO $pdo): void
{
    $pdo->exec('CREATE TABLE IF NOT EXISTS college_settings (
        college_id BIGINT UNSIGNED PRIMARY KEY,
        short_code VARCHAR(50) NULL,
        contact_email VARCHAR(255) NULL,
        contact_phone VARCHAR(50) NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_college_settings_college FOREIGN KEY (college_id) REFERENCES colleges(id)
            ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
}

function ensure_college_notices_table(PDO $pdo): void
{
    $pdo->exec('CREATE TABLE IF NOT EXISTS college_notices (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        college_id BIGINT UNSIGNED NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        audience ENUM("all","students","faculty") NOT NULL DEFAULT "all",
        created_by_user_id BIGINT UNSIGNED NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NULL,
        archived_at DATETIME NULL,
        KEY idx_college_notices_college_created (college_id, created_at),
        KEY idx_college_notices_audience (audience),
        CONSTRAINT fk_college_notices_college FOREIGN KEY (college_id) REFERENCES colleges(id)
            ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_college_notices_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id)
            ON DELETE SET NULL ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
}

// ---- Session enforcement ----

function enforce_active_college_for_session(SessionContext $sessionCtx, PDO $pdo): void
{
    if ($sessionCtx->currentUser === null) {
        return;
    }
    if (($sessionCtx->currentUser['role'] ?? null) === 'super_admin') {
        return;
    }
    $collegeId = isset($sessionCtx->currentUser['college_id']) ? (int)$sessionCtx->currentUser['college_id'] : 0;
    if ($collegeId <= 0) {
        return;
    }

    // Scalability measure: Cache college status for 5 minutes to avoid a DB query on EVERY api request.
    $cacheKey = '_college_active_check_' . $collegeId;
    if (isset($_SESSION[$cacheKey]) && (time() - $_SESSION[$cacheKey]) < 300) {
        return; // Validated recently
    }

    try {
        $stmt = $pdo->prepare('SELECT status, archived_at FROM colleges WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $collegeId]);
        $college = $stmt->fetch();
        if (!$college) {
            session_unset();
            session_destroy();
            json_response(['success' => false, 'error' => 'Your college account is no longer available. Contact the platform administrator.'], 403);
        }
        if (($college['archived_at'] ?? null) !== null || ($college['status'] ?? 'inactive') !== 'active') {
            session_unset();
            session_destroy();
            json_response(['success' => false, 'error' => 'Your college is inactive or removed. Contact the platform administrator.'], 403);
        }

        // Cache successful check
        $_SESSION[$cacheKey] = time();

    } catch (Throwable $e) {
        session_unset();
        session_destroy();
        json_response(['success' => false, 'error' => 'Unable to validate college access. Please login again.'], 403);
    }
}

// ---- Image / upload helpers ----

function normalize_profile_photo_data_url(string $dataUrl): string
{
    if (!preg_match('/^data:image\/(png|jpe?g|webp);base64,(.+)$/i', $dataUrl, $m)) {
        throw new RuntimeException('Invalid image format. Use PNG, JPG, or WEBP.');
    }
    $base64 = $m[2];
    $binary = base64_decode($base64, true);
    if ($binary === false) {
        throw new RuntimeException('Invalid image payload.');
    }
    if (strlen($binary) > 2 * 1024 * 1024) {
        throw new RuntimeException('Image too large. Max size is 2 MB.');
    }
    $mime = '';
    if (class_exists('finfo')) {
        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $mime = $finfo->buffer($binary) ?: '';
    } else {
        $imgInfo = @getimagesizefromstring($binary);
        $mime = is_array($imgInfo) && isset($imgInfo['mime']) ? (string)$imgInfo['mime'] : '';
    }
    $allowedMimes = [
        'image/png'  => 'png',
        'image/jpeg' => 'jpg',
        'image/webp' => 'webp',
    ];
    if (!isset($allowedMimes[$mime])) {
        throw new RuntimeException('Unsupported image type.');
    }
    return 'data:' . $mime . ';base64,' . base64_encode($binary);
}

function save_college_logo_from_data_url(string $dataUrl, int $collegeId): string
{
    if (!preg_match('/^data:image\/(png|jpe?g|webp);base64,(.+)$/i', $dataUrl, $m)) {
        throw new RuntimeException('Invalid image format. Use PNG, JPG, or WEBP.');
    }
    $base64 = $m[2];
    $binary = base64_decode($base64, true);
    if ($binary === false) {
        throw new RuntimeException('Invalid image payload.');
    }
    if (strlen($binary) > 2 * 1024 * 1024) {
        throw new RuntimeException('Image too large. Max size is 2 MB.');
    }
    $mime = '';
    if (class_exists('finfo')) {
        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $mime = $finfo->buffer($binary) ?: '';
    } else {
        $imgInfo = @getimagesizefromstring($binary);
        $mime = is_array($imgInfo) && isset($imgInfo['mime']) ? (string)$imgInfo['mime'] : '';
    }
    $allowedMimes = [
        'image/png'  => 'png',
        'image/jpeg' => 'jpg',
        'image/webp' => 'webp',
    ];
    if (!isset($allowedMimes[$mime])) {
        throw new RuntimeException('Unsupported image type.');
    }
    $ext = $allowedMimes[$mime];
    $rootDir = dirname(__DIR__, 2);
    $uploadDir = $rootDir . '/uploads/college_logos';
    if (!is_dir($uploadDir) && !mkdir($uploadDir, 0775, true) && !is_dir($uploadDir)) {
        throw new RuntimeException('Unable to create upload directory.');
    }
    $filename = 'c' . $collegeId . '_' . time() . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
    $absPath = $uploadDir . '/' . $filename;
    if (file_put_contents($absPath, $binary) === false) {
        throw new RuntimeException('Failed to save image.');
    }
    return 'uploads/college_logos/' . $filename;
}

// ---- ID generation helpers ----

function derive_college_code(string $collegeName): string
{
    $upper = strtoupper($collegeName);
    $words = preg_split('/[^A-Z0-9]+/', $upper, -1, PREG_SPLIT_NO_EMPTY);
    $code = '';
    foreach ($words as $w) {
        if ($w !== '') {
            $code .= $w[0];
            if (strlen($code) >= 3) {
                break;
            }
        }
    }
    if (strlen($code) < 3) {
        $flat = preg_replace('/[^A-Z0-9]/', '', $upper) ?? '';
        $need = 3 - strlen($code);
        $code .= substr($flat, 0, $need);
    }
    $code = substr($code, 0, 3);
    if (strlen($code) < 3) {
        $code = str_pad($code, 3, 'X');
    }
    return $code;
}

function get_college_student_prefix(PDO $pdo, int $collegeId): string
{
    ensure_college_settings_table($pdo);
    $stmt = $pdo->prepare(
        'SELECT c.name, cs.short_code
         FROM colleges c
         LEFT JOIN college_settings cs ON cs.college_id = c.id
         WHERE c.id = :id
         LIMIT 1'
    );
    $stmt->execute([':id' => $collegeId]);
    $row = $stmt->fetch();
    if (!$row) {
        throw new RuntimeException('College not found');
    }
    $shortCode = strtoupper(trim((string)($row['short_code'] ?? '')));
    $shortCode = preg_replace('/[^A-Z0-9]/', '', $shortCode) ?? '';
    if ($shortCode !== '') {
        return substr($shortCode, 0, 3);
    }
    return derive_college_code((string)($row['name'] ?? 'COL'));
}

function get_college_faculty_prefix(PDO $pdo, int $collegeId): string
{
    $studentPrefix = get_college_student_prefix($pdo, $collegeId);
    return $studentPrefix . 'F';
}

function generate_student_unique_id(PDO $pdo, int $collegeId): string
{
    $prefix = get_college_student_prefix($pdo, $collegeId);
    $pattern = $prefix . '%';
    // NOTE: Do NOT use FOR UPDATE here — this function is called from both
    // transactional and non-transactional contexts. FOR UPDATE outside a
    // transaction causes MySQL to throw "There is no active transaction".
    // Uniqueness is guaranteed by the UNIQUE constraint on unique_user_id.
    $stmt = $pdo->prepare(
        "SELECT unique_user_id
         FROM users
         WHERE college_id = :cid
           AND role = 'student'
           AND unique_user_id LIKE :pattern"
    );
    $stmt->execute([':cid' => $collegeId, ':pattern' => $pattern]);
    $rows = $stmt->fetchAll();
    $maxSeq = 0;
    foreach ($rows as $row) {
        $uid = (string)($row['unique_user_id'] ?? '');
        $regex = '/^' . preg_quote($prefix, '/') . '(\d+)$/';
        if (preg_match($regex, $uid, $m)) {
            $num = (int)$m[1];
            if ($num > $maxSeq) {
                $maxSeq = $num;
            }
        }
    }
    $next = $maxSeq + 1;
    return sprintf('%s%05d', $prefix, $next);
}

function generate_faculty_unique_id(PDO $pdo, int $collegeId): string
{
    $prefix = get_college_faculty_prefix($pdo, $collegeId);
    $pattern = $prefix . '%';
    // NOTE: Do NOT use FOR UPDATE here — same reason as generate_student_unique_id.
    $stmt = $pdo->prepare(
        "SELECT unique_user_id
         FROM users
         WHERE college_id = :cid
           AND role = 'faculty'
           AND unique_user_id LIKE :pattern"
    );
    $stmt->execute([':cid' => $collegeId, ':pattern' => $pattern]);
    $rows = $stmt->fetchAll();
    $maxSeq = 0;
    foreach ($rows as $row) {
        $uid = (string)($row['unique_user_id'] ?? '');
        $regex = '/^' . preg_quote($prefix, '/') . '(\d+)$/';
        if (preg_match($regex, $uid, $m)) {
            $num = (int)$m[1];
            if ($num > $maxSeq) {
                $maxSeq = $num;
            }
        }
    }
    $next = $maxSeq + 1;
    return sprintf('%s%05d', $prefix, $next);
}

function generate_college_admin_unique_id(PDO $pdo): string
{
    // Find current max sequence to start from, then verify uniqueness
    $stmt = $pdo->query(
        "SELECT MAX(CAST(SUBSTRING(unique_user_id, 9) AS UNSIGNED)) AS max_seq
         FROM users
         WHERE role = 'college_admin'
           AND unique_user_id REGEXP '^COLADMIN[0-9]+$'"
    );
    $row = $stmt ? $stmt->fetch() : null;
    $nextSeq = (int)($row['max_seq'] ?? 0) + 1;

    // Confirm uniqueness with a retry loop (handles race conditions)
    $check = $pdo->prepare("SELECT 1 FROM users WHERE unique_user_id = :uid LIMIT 1");
    for ($attempt = 0; $attempt < 20; $attempt++) {
        $candidate = sprintf('COLADMIN%03d', $nextSeq);
        $check->execute([':uid' => $candidate]);
        if (!$check->fetch()) {
            return $candidate;
        }
        $nextSeq++;
    }

    // Fallback with timestamp suffix to guarantee uniqueness
    return 'COLADMIN' . date('ymdHi') . random_int(10, 99);
}

function generate_secure_password(int $length = 12): string
{
    $pwd = '';
    $chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
    $maxIdx = strlen($chars) - 1;
    for ($i = 0; $i < $length; $i++) {
        $pwd .= $chars[random_int(0, $maxIdx)];
    }
    return $pwd;
}
