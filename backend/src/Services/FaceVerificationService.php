<?php

/**
 * Face Verification Service
 * Handles face matching, verification attempts, location checks, and attendance marking
 * 
 * Supports multi-embedding storage (one per angle) for robust verification.
 */

class FaceVerificationService
{
    private PDO $pdo;
    private static array $embeddingCache = []; // Cache embeddings by student_id
    private const FACE_MAX_ATTEMPTS = 3;
    private const LOCATION_VERIFICATION_RADIUS = 200; // meters

    // Core Euclidean distance thresholds (smaller = better).
    // Tightened to reduce false accepts where one student's face passes for
    // another student's account.
    private const MATCH_DISTANCE_GOOD = 0.40; // Tightened from 0.45
    private const MATCH_DISTANCE_ACCEPTABLE = 0.48; // Tightened from 0.52
    private const MATCH_DISTANCE_MIN_GAP = 0.15; // Increased from 0.12 for better separation

    /**
     * Shared verification config for API responses and frontend sync.
     */
    public static function verificationConfig(): array
    {
        return [
            'accept_threshold' => self::matchScoreFromDistance(self::MATCH_DISTANCE_GOOD),
            'retry_threshold' => self::matchScoreFromDistance(self::MATCH_DISTANCE_ACCEPTABLE),
            'max_attempts' => self::FACE_MAX_ATTEMPTS,
            'location_radius' => self::LOCATION_VERIFICATION_RADIUS,
        ];
    }

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
        // Only run expensive schema migrations once per PHP worker lifecycle
        static $tablesEnsured = false;
        if (!$tablesEnsured) {
            $this->ensureTablesExist();
            $tablesEnsured = true;
        }
    }

    /**
     * Ensure all required tables exist
     */
    private function ensureTablesExist(): void
    {
        // Face embeddings table — supports MULTIPLE embeddings per student (one per angle)
        try {
            $this->pdo->exec(
                'CREATE TABLE IF NOT EXISTS face_embeddings (
                    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    student_id BIGINT UNSIGNED NOT NULL,
                    embedding_vector LONGTEXT NOT NULL,
                    embedding_type ENUM("front","left","right","up","down","neutral","glasses") DEFAULT "front",
                    quality_score DECIMAL(5,2) NULL,
                    registered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    KEY idx_face_embeddings_student (student_id),
                    CONSTRAINT fk_face_embeddings_student FOREIGN KEY (student_id) REFERENCES students(student_id)
                        ON DELETE CASCADE ON UPDATE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
            );
        } catch (Throwable $e) { error_log('face_embeddings table ensure skipped: ' . $e->getMessage()); }

        // Face verification attempts tracking
        try {
            $this->pdo->exec(
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
                    UNIQUE KEY uq_face_attempt_session_student (session_id, student_id),
                    CONSTRAINT fk_face_attempt_session FOREIGN KEY (session_id) REFERENCES attendance_sessions(id)
                        ON DELETE CASCADE ON UPDATE CASCADE,
                    CONSTRAINT fk_face_attempt_student FOREIGN KEY (student_id) REFERENCES students(student_id)
                        ON DELETE CASCADE ON UPDATE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
            );
        } catch (Throwable $e) { error_log('face_verification_attempts table ensure skipped: ' . $e->getMessage()); }

        // Attendance records (verification status)
        try {
            $this->pdo->exec(
                'CREATE TABLE IF NOT EXISTS attendance_records (
                    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    session_id BIGINT UNSIGNED NOT NULL,
                    student_id BIGINT UNSIGNED NOT NULL,
                    timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    match_score DECIMAL(5,2) NULL,
                    location_lat DECIMAL(10,8) NULL,
                    location_lng DECIMAL(10,8) NULL,
                    location_verified TINYINT(1) NOT NULL DEFAULT 0,
                    status ENUM("present","rejected","duplicate","late","invalid_otp","location_out_of_range") NOT NULL,
                    UNIQUE KEY uq_att_record_session_student (session_id, student_id),
                    KEY idx_att_record_student (student_id),
                    KEY idx_att_record_timestamp (timestamp),
                    KEY idx_att_record_location (location_verified),
                    CONSTRAINT fk_att_record_session FOREIGN KEY (session_id) REFERENCES attendance_sessions(id)
                        ON DELETE CASCADE ON UPDATE CASCADE,
                    CONSTRAINT fk_att_record_student FOREIGN KEY (student_id) REFERENCES students(student_id)
                        ON DELETE CASCADE ON UPDATE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
            );
        } catch (Throwable $e) { error_log('attendance_records table ensure skipped: ' . $e->getMessage()); }

        // College location settings
        try {
            $this->pdo->exec(
                'CREATE TABLE IF NOT EXISTS college_location_settings (
                    college_id BIGINT UNSIGNED PRIMARY KEY,
                    latitude DECIMAL(10,8) NOT NULL,
                    longitude DECIMAL(10,8) NOT NULL,
                    radius_meters INT UNSIGNED NOT NULL DEFAULT 200,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    CONSTRAINT fk_college_location_settings FOREIGN KEY (college_id) REFERENCES colleges(id)
                        ON DELETE CASCADE ON UPDATE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
            );
        } catch (Throwable $e) {
            // If the FK cannot be created (e.g., colleges.id type/engine mismatch), fall back to a compatible table.
            $this->ensureCollegeLocationSettingsFallback();
        }

        // Backfill columns for older schemas (CREATE TABLE IF NOT EXISTS won't add new columns).
        try {
            if (!$this->columnExists('face_verification_attempts', 'locked_reason')) {
                $this->pdo->exec('ALTER TABLE face_verification_attempts ADD COLUMN locked_reason VARCHAR(255) NULL AFTER locked');
            }
        } catch (Throwable $e) {
            // Keep API usable even if migration fails.
        }

        try {
            if (!$this->columnExists('face_embeddings', 'embedding_type')) {
                $this->pdo->exec('ALTER TABLE face_embeddings ADD COLUMN embedding_type ENUM("front","left","right","up","down","neutral","glasses") DEFAULT "front" AFTER embedding_vector');
            }
        } catch (Throwable $e) {
            // Keep API usable even if migration fails.
        }

        // Add quality_score column if missing
        try {
            if (!$this->columnExists('face_embeddings', 'quality_score')) {
                $this->pdo->exec('ALTER TABLE face_embeddings ADD COLUMN quality_score DECIMAL(5,2) NULL AFTER embedding_type');
            }
        } catch (Throwable $e) {
            // Keep API usable even if migration fails.
        }

        // Migrate from UNIQUE(student_id) to non-unique index to support multi-embedding
        $this->migrateToMultiEmbedding();
    }

    /**
     * Remove old UNIQUE constraint on student_id to allow multiple embeddings per student.
     */
    private function migrateToMultiEmbedding(): void
    {
        try {
            // Check if the UNIQUE key still exists
            $stmt = $this->pdo->query(
                "SELECT 1
                 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME = 'face_embeddings'
                   AND CONSTRAINT_TYPE = 'UNIQUE'
                   AND CONSTRAINT_NAME = 'uq_face_embeddings_student'
                 LIMIT 1"
            );
            if ($stmt->fetch()) {
                $this->pdo->exec('ALTER TABLE face_embeddings DROP INDEX uq_face_embeddings_student');
            }
        } catch (Throwable $e) {
            // Ignore — either already dropped or table doesn't use that name.
        }

        // Also try the default unique key name MariaDB/MySQL might have used
        try {
            $stmt = $this->pdo->query(
                "SELECT 1
                 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME = 'face_embeddings'
                   AND CONSTRAINT_TYPE = 'UNIQUE'
                   AND CONSTRAINT_NAME = 'student_id'
                 LIMIT 1"
            );
            if ($stmt->fetch()) {
                $this->pdo->exec('ALTER TABLE face_embeddings DROP INDEX student_id');
            }
        } catch (Throwable $e) {
            // Ignore.
        }
    }

    private function ensureCollegeLocationSettingsFallback(): void
    {
        try {
            $typeStmt = $this->pdo->query(
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

            $this->pdo->exec(
                'CREATE TABLE IF NOT EXISTS college_location_settings (
                    college_id ' . $colType . ' NOT NULL,
                    latitude DECIMAL(10,8) NOT NULL,
                    longitude DECIMAL(10,8) NOT NULL,
                    radius_meters INT UNSIGNED NOT NULL DEFAULT 200,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    PRIMARY KEY (college_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
            );

            // Try to add the FK if possible; ignore if it fails.
            $fkStmt = $this->pdo->query(
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
                $this->pdo->exec(
                    'ALTER TABLE college_location_settings
                     ADD CONSTRAINT fk_college_location_settings
                     FOREIGN KEY (college_id) REFERENCES colleges(id)
                     ON DELETE CASCADE ON UPDATE CASCADE'
                );
            }
        } catch (Throwable $e) {
            // As a last resort, leave location settings unconfigured.
        }
    }

    private function columnExists(string $table, string $column): bool
    {
        try {
            $stmt = $this->pdo->prepare('SHOW COLUMNS FROM `' . $table . '` LIKE :col');
            $stmt->execute([':col' => $column]);
            return (bool)$stmt->fetch();
        } catch (Throwable $e) {
            return false;
        }
    }

    /**
     * Validate OTP and get session details
     */
    public function validateOtp(string $otpCode, int $collegeId): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT 
                s.id as session_id,
                s.status,
                s.subject,
                s.extra_reason,
                s.start_time,
                s.end_time,
                s.otp_expiry,
                c.name as course_name,
                c.year,
                c.semester,
                c.section,
                f.user_id as faculty_id,
                u.name as faculty_name
            FROM attendance_sessions s
            JOIN courses_sections c ON s.course_id = c.id
            JOIN faculty f ON s.faculty_id = f.faculty_id
            JOIN users u ON f.user_id = u.id
            WHERE s.college_id = :college_id
            AND s.otp_code = :otp
            AND s.status IN ("active", "scheduled")
            AND s.otp_expiry > NOW()
            LIMIT 1'
        );

        $stmt->execute([
            ':college_id' => $collegeId,
            ':otp' => $otpCode
        ]);

        return $stmt->fetch() ?: null;
    }

    /**
     * Get face verification attempt record
     */
    public function getVerificationAttempt(int $sessionId, int $studentId): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT * FROM face_verification_attempts 
            WHERE session_id = :session_id AND student_id = :student_id
            LIMIT 1'
        );

        $stmt->execute([
            ':session_id' => $sessionId,
            ':student_id' => $studentId
        ]);

        return $stmt->fetch() ?: null;
    }

    /**
     * Initialize or get verification attempt
     */
    public function initializeVerificationAttempt(int $sessionId, int $studentId): array
    {
        $existing = $this->getVerificationAttempt($sessionId, $studentId);

        if ($existing) {
            return $existing;
        }

        // Create new attempt record
        $stmt = $this->pdo->prepare(
            'INSERT INTO face_verification_attempts (session_id, student_id, attempts_used, locked)
            VALUES (:session_id, :student_id, 0, 0)
            ON DUPLICATE KEY UPDATE updated_at = NOW()'
        );

        $stmt->execute([
            ':session_id' => $sessionId,
            ':student_id' => $studentId
        ]);

        return $this->getVerificationAttempt($sessionId, $studentId);
    }

    /**
     * Check if student has registered face embeddings
     */
    public function isStudentFaceRegistered(int $studentId): bool
    {
        $stmt = $this->pdo->prepare(
            'SELECT 1 FROM face_embeddings WHERE student_id = :student_id LIMIT 1'
        );
        $stmt->execute([':student_id' => $studentId]);
        return (bool)$stmt->fetch();
    }

    /**
     * Get ALL registered face embeddings for a student (one per angle).
     * Returns array of arrays, each being a 128-dim float vector.
     */
    public function getRegisteredEmbeddings(int $studentId): array
    {
        if (isset(self::$embeddingCache[$studentId])) {
            return self::$embeddingCache[$studentId];
        }

        $stmt = $this->pdo->prepare(
            'SELECT embedding_vector, embedding_type FROM face_embeddings 
            WHERE student_id = :student_id
            ORDER BY registered_at DESC'
        );

        $stmt->execute([':student_id' => $studentId]);
        $rows = $stmt->fetchAll();

        $embeddings = [];
        foreach ($rows as $row) {
            $decoded = json_decode($row['embedding_vector'], true);
            if (is_array($decoded) && count($decoded) === 128) {
                $embeddings[] = [
                    'vector' => $decoded,
                    'type' => $row['embedding_type'] ?? 'front'
                ];
            }
        }

        self::$embeddingCache[$studentId] = $embeddings;
        return $embeddings;
    }

    /**
     * Clear embedding cache for a student
     */
    public static function clearEmbeddingCache(int $studentId): void
    {
        unset(self::$embeddingCache[$studentId]);
    }

    /**
     * Normalize embedding vector
     */
    public static function normalizeEmbedding($vector): ?array
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

    /**
     * L2-normalize embedding to unit length.
     * face-api descriptors are expected to be near unit vectors, but normalization
     * here guards against drift and inconsistent capture pipelines.
     */
    private static function l2Normalize(array $vector): ?array
    {
        if (count($vector) !== 128) {
            return null;
        }

        $sumSquares = 0.0;
        foreach ($vector as $value) {
            $v = (float)$value;
            $sumSquares += ($v * $v);
        }

        $norm = sqrt($sumSquares);
        if (!is_finite($norm) || $norm <= 0.0) {
            return null;
        }

        $normalized = [];
        foreach ($vector as $value) {
            $normalized[] = ((float)$value) / $norm;
        }

        return $normalized;
    }

    /**
     * Compute Euclidean distance between two normalized embeddings.
     * Returns the raw distance (smaller = more similar).
     */
    private static function computeEuclideanDistance(array $registered, array $live): ?float
    {
        if (count($registered) !== count($live)) {
            return null;
        }

        $registeredNorm = self::l2Normalize($registered);
        $liveNorm = self::l2Normalize($live);
        if ($registeredNorm === null || $liveNorm === null) {
            return null;
        }

        $sumSquaredDiff = 0.0;
        $length = count($registeredNorm);
        for ($i = 0; $i < $length; $i++) {
            $diff = ((float)$registeredNorm[$i]) - ((float)$liveNorm[$i]);
            $sumSquaredDiff += ($diff * $diff);
        }

        return sqrt($sumSquaredDiff);
    }

    /**
     * Convert Euclidean distance into a 0–100 similarity percentage
     * (used only for UI; decision thresholds use the raw distance).
     */
    private static function matchScoreFromDistance(float $euclideanDistance): float
    {
        // Sigmoid-like conversion: maps distance to percentage
        // Refined calibration for ResNet-34 embeddings:
        //   distance 0.35 ≈ 92%, 0.40 ≈ 88%, 0.50 ≈ 73%, 0.60 ≈ 50%, 0.70 ≈ 27%
        $matchScore = 100.0 / (1.0 + exp(($euclideanDistance - 0.6) / 0.08));
        return max(0.0, min(100.0, round($matchScore, 2)));
    }

    /**
     * Compute the smallest Euclidean distance across all stored embeddings.
     * This is the core value used for verification decisions, strictly
     * following the distance-based thresholds from the specification.
     */
    public function computeBestMatchDistance(array $storedEmbeddings, array $liveEmbedding): ?float
    {
        $bestDistance = null;

        foreach ($storedEmbeddings as $stored) {
            $vector = $stored['vector'] ?? $stored;
            $normalized = self::normalizeEmbedding($vector);
            if (!$normalized) {
                continue;
            }

            $distance = self::computeEuclideanDistance($normalized, $liveEmbedding);
            if ($distance === null) {
                continue;
            }

            if ($bestDistance === null || $distance < $bestDistance) {
                $bestDistance = $distance;
            }
        }

        return $bestDistance;
    }

    /**
     * Find the closest non-target student match for the given live embedding.
     * This acts as an anti-cross-match safeguard so a face is accepted only
     * when it is clearly closest to the intended student.
     */
    private function findClosestOtherStudentMatch(int $studentId, array $liveEmbedding): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT fe.student_id, fe.embedding_vector
             FROM face_embeddings fe
             JOIN students s ON s.student_id = fe.student_id
             JOIN users u ON u.id = s.user_id
             WHERE fe.student_id <> :student_id
               AND u.role = "student"
               AND u.deleted_at IS NULL
               AND u.status = "active"'
        );
        $stmt->execute([':student_id' => $studentId]);

        $closest = null;
        while ($row = $stmt->fetch()) {
            $vector = json_decode((string)$row['embedding_vector'], true);
            $normalized = self::normalizeEmbedding($vector);
            if ($normalized === null) {
                continue;
            }

            $distance = self::computeEuclideanDistance($normalized, $liveEmbedding);
            if ($distance === null) {
                continue;
            }

            if ($closest === null || $distance < $closest['distance']) {
                $closest = [
                    'student_id' => (int)$row['student_id'],
                    'distance' => $distance,
                ];
            }
        }

        return $closest;
    }

    /**
     * Perform face verification for a specific student.
     */
    public function verifyFace(
        int $sessionId,
        int $studentId,
        array $liveEmbedding
    ): array {
        // Validate embedding
        $normalizedLive = self::normalizeEmbedding($liveEmbedding);
        if (!$normalizedLive) {
            return [
                'success' => false,
                'error' => 'Invalid face embedding format',
                'decision' => 'REJECTED'
            ];
        }

        // Check if student has registered face
        if (!$this->isStudentFaceRegistered($studentId)) {
            return [
                'success' => false,
                'error' => 'Face not registered for this student',
                'decision' => 'REJECTED'
            ];
        }

        // Get verification attempt
        $attempt = $this->initializeVerificationAttempt($sessionId, $studentId);

        // Check if locked
        if ($attempt['locked']) {
            return [
                'success' => false,
                'error' => $attempt['locked_reason'] ?? 'Verification locked due to too many failed attempts',
                'decision' => 'LOCKED',
                'attempts_remaining' => 0
            ];
        }

        // Check attempt count
        $attemptsUsed = (int)$attempt['attempts_used'];
        if ($attemptsUsed >= self::FACE_MAX_ATTEMPTS) {
            $this->lockVerificationAttempt(
                $sessionId,
                $studentId,
                'Maximum verification attempts exceeded'
            );

            return [
                'success' => false,
                'error' => 'Maximum verification attempts exceeded',
                'decision' => 'LOCKED',
                'attempts_remaining' => 0
            ];
        }

        // Get ALL registered embeddings (multi-angle)
        $storedEmbeddings = $this->getRegisteredEmbeddings($studentId);
        if (empty($storedEmbeddings)) {
            return [
                'success' => false,
                'error' => 'No registered face found',
                'decision' => 'REJECTED'
            ];
        }

        // Compute best (smallest) Euclidean distance across the target student's embeddings.
        $bestDistance = $this->computeBestMatchDistance($storedEmbeddings, $normalizedLive);
        if ($bestDistance === null) {
            return [
                'success' => false,
                'error' => 'Unable to compute face distance',
                'decision' => 'REJECTED'
            ];
        }

        // The target student must also be the clearly best match across all
        // registered students. If another student's face is too close, reject.
        $closestOtherMatch = $this->findClosestOtherStudentMatch($studentId, $normalizedLive);
        $closestOtherDistance = $closestOtherMatch['distance'] ?? null;
        $distanceGap = $closestOtherDistance !== null ? ($closestOtherDistance - $bestDistance) : null;

        // Derive UI-friendly percentage for logging and frontend display
        $matchScore = self::matchScoreFromDistance($bestDistance);

        // Distance-based decision logic (smaller = better):
        //   1. Target student must be clearly better than any other registered
        //      student by a minimum distance gap.
        //   2. Then apply strict target thresholds.
        $decision = 'REJECT';
        $message = 'Face does not match registered photo. Please ensure good lighting and clear face.';
        $isDistinctBestMatch =
            $closestOtherDistance === null ||
            ($distanceGap !== null && $distanceGap > self::MATCH_DISTANCE_MIN_GAP);

        // Penalize match score if identity is not distinct (conflicting with another student)
        if (!$isDistinctBestMatch && $distanceGap !== null) {
            // Drop score based on how bad the gap is
            $penalty = abs(min(0, $distanceGap - self::MATCH_DISTANCE_MIN_GAP)) * 100;
            $matchScore = max(10.0, min($matchScore, 45.0 - $penalty));
        }

        if (!$isDistinctBestMatch) {
            $decision = 'REJECT';
            $message = 'Face is too close to another registered student. Only the correct student face should verify for this account.';
        } elseif ($bestDistance <= self::MATCH_DISTANCE_GOOD) {
            $decision = 'ACCEPT';
            $message = 'Face verified successfully';
        } elseif ($bestDistance <= self::MATCH_DISTANCE_ACCEPTABLE) {
            $decision = 'RETRY';
            $message = 'Face is close to the registered student but not strong enough yet. Please face the camera straight and try again.';
        }

        error_log(
            sprintf(
                '[FaceVerification] session=%d student=%d competing_student=%s distance=%.4f competing_distance=%s gap=%s match_score=%.2f decision=%s',
                $sessionId,
                $studentId,
                $closestOtherMatch['student_id'] ?? 'null',
                $bestDistance,
                $closestOtherDistance !== null ? number_format($closestOtherDistance, 4, '.', '') : 'null',
                $distanceGap !== null ? number_format($distanceGap, 4, '.', '') : 'null',
                $matchScore,
                $decision
            )
        );

        $nextAttemptsUsed = $attemptsUsed + 1;
        $attemptsRemaining = max(0, self::FACE_MAX_ATTEMPTS - $nextAttemptsUsed);
        $lockNow = ($decision !== 'ACCEPT' && $attemptsRemaining <= 0);
        $lockReason = $lockNow ? 'Maximum verification attempts exceeded' : null;

        $this->updateVerificationAttempt($sessionId, $studentId, $matchScore, $decision, $lockNow ? 1 : 0, $lockReason);

        if ($decision === 'ACCEPT') {
            return [
                'success' => true,
                'match_score' => $matchScore,
                'decision' => $decision,
                'message' => $message,
                'attempts_remaining' => $attemptsRemaining
            ];
        }

        if ($lockNow) {
            return [
                'success' => false,
                'match_score' => $matchScore,
                'decision' => 'LOCKED',
                'error' => $lockReason,
                'attempts_remaining' => 0
            ];
        }

        return [
            'success' => false,
            'match_score' => $matchScore,
            'decision' => $decision,
            'message' => $message,
            'attempts_remaining' => $attemptsRemaining
        ];
    }

    /**
     * Update verification attempt record
     */
    private function updateVerificationAttempt(
        int $sessionId,
        int $studentId,
        float $matchScore,
        string $decision,
        int $locked,
        ?string $lockedReason
    ): void {
        $hasLockedReason = $this->columnExists('face_verification_attempts', 'locked_reason');

        $sql =
            'UPDATE face_verification_attempts
             SET attempts_used = attempts_used + 1,
                 last_match_score = :match_score,
                 last_decision = :decision,
                 locked = :locked,
                 updated_at = NOW()';
        if ($hasLockedReason) {
            $sql .= ', locked_reason = :locked_reason';
        }
        $sql .= ' WHERE session_id = :session_id AND student_id = :student_id';

        $params = [
            ':match_score' => $matchScore,
            ':decision' => $decision,
            ':locked' => $locked,
            ':session_id' => $sessionId,
            ':student_id' => $studentId,
        ];
        if ($hasLockedReason) {
            $params[':locked_reason'] = $lockedReason;
        }

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
    }

    /**
     * Lock verification attempt
     */
    private function lockVerificationAttempt(
        int $sessionId,
        int $studentId,
        string $reason
    ): void {
        $hasLockedReason = $this->columnExists('face_verification_attempts', 'locked_reason');

        $sql =
            'UPDATE face_verification_attempts
             SET locked = 1,
                 updated_at = NOW()';
        if ($hasLockedReason) {
            $sql .= ', locked_reason = :reason';
        }
        $sql .= ' WHERE session_id = :session_id AND student_id = :student_id';

        $params = [
            ':session_id' => $sessionId,
            ':student_id' => $studentId,
        ];
        if ($hasLockedReason) {
            $params[':reason'] = $reason;
        }

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
    }

    /**
     * Verify location (check if within college radius)
     */
    public function verifyLocation(
        int $collegeId,
        float $userLat,
        float $userLng
    ): array {
        // Get college location settings
        $stmt = $this->pdo->prepare(
            'SELECT latitude, longitude, radius_meters 
            FROM college_location_settings 
            WHERE college_id = :college_id
            LIMIT 1'
        );

        $stmt->execute([':college_id' => $collegeId]);
        $location = $stmt->fetch();

        if (!$location) {
            // Location verification not configured, allow by default
            return [
                'success' => true,
                'message' => 'Location verification not configured',
                'configured' => false
            ];
        }

        $collegeLat = (float)$location['latitude'];
        $collegeLng = (float)$location['longitude'];
        $radius = (int)$location['radius_meters'];

        // Calculate distance using Haversine formula
        $distance = $this->haversineDistance($userLat, $userLng, $collegeLat, $collegeLng);
        $distanceRounded = round($distance, 2);

        if ($distance <= $radius) {
            return [
                'success' => true,
                'message' => 'Location verified',
                'distance' => $distanceRounded,
                'radius' => $radius,
                'configured' => true
            ];
        } else {
            return [
                'success' => false,
                'message' => "You are {$distanceRounded}m away from college. Attendance allowed only within {$radius}m radius.",
                'distance' => $distanceRounded,
                'radius' => $radius,
                'configured' => true
            ];
        }
    }

    /**
     * Calculate distance between two coordinates using Haversine formula
     */
    private function haversineDistance(
        float $lat1,
        float $lon1,
        float $lat2,
        float $lon2
    ): float {
        $earthRadiusMeters = 6371000;

        $dLat = deg2rad($lat2 - $lat1);
        $dLon = deg2rad($lon2 - $lon1);

        $a = sin($dLat / 2) * sin($dLat / 2) +
            cos(deg2rad($lat1)) * cos(deg2rad($lat2)) *
            sin($dLon / 2) * sin($dLon / 2);

        $c = 2 * atan2(sqrt($a), sqrt(1 - $a));

        return $earthRadiusMeters * $c;
    }

    /**
     * Mark attendance after successful verification
     */
    public function markAttendance(
        int $sessionId,
        int $studentId,
        float $matchScore,
        ?array $location = null
    ): array {
        // Check if already marked
        $existing = $this->getAttendanceRecord($sessionId, $studentId);
        if ($existing) {
            return [
                'success' => false,
                'error' => 'Attendance already marked for this session',
                'status' => 'DUPLICATE'
            ];
        }

        // Insert attendance record
        $stmt = $this->pdo->prepare(
            'INSERT INTO attendance_records 
            (session_id, student_id, match_score, location_lat, location_lng, location_verified, status, timestamp)
            VALUES (:session_id, :student_id, :match_score, :lat, :lng, :location_verified, :status, NOW())'
        );

        $locationVerified = ($location && $location['verified']) ? 1 : 0;

        $stmt->execute([
            ':session_id' => $sessionId,
            ':student_id' => $studentId,
            ':match_score' => $matchScore,
            ':lat' => $location['lat'] ?? null,
            ':lng' => $location['lng'] ?? null,
            ':location_verified' => $locationVerified,
            ':status' => 'present'
        ]);

        // Update student's face_registered flag if not already
        $this->updateStudentFaceRegisteredFlag($studentId, true);

        return [
            'success' => true,
            'message' => 'Attendance marked successfully',
            'status' => 'PRESENT'
        ];
    }

    /**
     * Get attendance record
     */
    private function getAttendanceRecord(int $sessionId, int $studentId): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT * FROM attendance_records 
            WHERE session_id = :session_id AND student_id = :student_id
            LIMIT 1'
        );

        $stmt->execute([
            ':session_id' => $sessionId,
            ':student_id' => $studentId
        ]);

        return $stmt->fetch() ?: null;
    }

    /**
     * Update student's face_registered flag
     */
    private function updateStudentFaceRegisteredFlag(int $studentId, bool $registered): void
    {
        $stmt = $this->pdo->prepare(
            'UPDATE students SET face_registered = :registered WHERE student_id = :student_id'
        );

        $stmt->execute([
            ':registered' => $registered ? 1 : 0,
            ':student_id' => $studentId
        ]);
    }

    /**
     * Store multiple face embeddings for registration (one per angle).
     * Deletes all existing embeddings for the student, then inserts the new set.
     */
    public function storeMultipleEmbeddings(int $studentId, array $embeddingSet): int
    {
        $insertedCount = 0;
        $this->pdo->beginTransaction();

        try {
            // Delete all existing embeddings only when we are ready to replace them atomically.
            $this->pdo->prepare('DELETE FROM face_embeddings WHERE student_id = :sid')
                ->execute([':sid' => $studentId]);

            $hasQuality = $this->columnExists('face_embeddings', 'quality_score');

            foreach ($embeddingSet as $item) {
                $vector = $item['embedding'] ?? $item['vector'] ?? null;
                $type = $item['type'] ?? 'front';
                $quality = $item['quality'] ?? null;

                $normalized = self::normalizeEmbedding($vector);
                if (!$normalized) {
                    continue; // Skip invalid embeddings
                }

                $embeddingJson = json_encode($normalized);

                if ($hasQuality && $quality !== null) {
                    $stmt = $this->pdo->prepare(
                        'INSERT INTO face_embeddings (student_id, embedding_vector, embedding_type, quality_score)
                        VALUES (:student_id, :vector, :type, :quality)'
                    );
                    $stmt->execute([
                        ':student_id' => $studentId,
                        ':vector' => $embeddingJson,
                        ':type' => $type,
                        ':quality' => $quality,
                    ]);
                } else {
                    $stmt = $this->pdo->prepare(
                        'INSERT INTO face_embeddings (student_id, embedding_vector, embedding_type)
                        VALUES (:student_id, :vector, :type)'
                    );
                    $stmt->execute([
                        ':student_id' => $studentId,
                        ':vector' => $embeddingJson,
                        ':type' => $type,
                    ]);
                }

                $insertedCount++;
            }

            if ($insertedCount <= 0) {
                $this->pdo->rollBack();
                return 0;
            }

            $this->pdo->commit();
            return $insertedCount;
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }
    }

    /**
     * Store a single face embedding for registration (legacy/compatibility).
     */
    public function storeEmbedding(int $studentId, array $embedding): bool
    {
        $normalized = self::normalizeEmbedding($embedding);
        if (!$normalized) {
            return false;
        }

        // For legacy single-embedding calls, replace all with one front embedding
        return $this->storeMultipleEmbeddings($studentId, [
            ['embedding' => $normalized, 'type' => 'front']
        ]) > 0;
    }
}
