<?php

class StudentController
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

    public function dashboardSummary(): void
    {
        Session::requireRole($this->sessionCtx, ['student']);
        $userId = (int)$this->sessionCtx->currentUser['id'];
        $nowTime = date('H:i:s');
        $dow = (int)date('N');

        $stmt = $this->pdo->prepare(
            'SELECT u.name, u.unique_user_id, u.email, s.student_id, s.dept_id, s.course, s.year, s.semester, s.section, s.face_registered,
                    d.name AS dept_name
             FROM users u
             JOIN students s ON s.user_id = u.id
             LEFT JOIN departments d ON d.id = s.dept_id
             WHERE u.id = :uid
             LIMIT 1'
        );
        $stmt->execute([':uid' => $userId]);
        $student = $stmt->fetch();
        if (!$student) { json_response(['success' => false, 'error' => 'Student profile not found'], 404); }

        $currentClass = null;
        $upcomingClasses = [];
        $totalSessions = 0;
        $presentCount = 0;
        $recentAttendance = [];

        try {
            $stmt = $this->pdo->prepare(
                'SELECT t.id, t.subject, t.start_time, t.end_time
                 FROM timetable t
                 JOIN courses_sections cs ON cs.id = t.course_id
                 WHERE cs.dept_id = :dept_id AND cs.year = :year AND cs.semester = :semester AND cs.section = :section
                   AND t.day_of_week = :dow AND t.start_time <= :now_time AND t.end_time >= :now_time
                 ORDER BY t.start_time LIMIT 1'
            );
            $stmt->execute([':dept_id' => $student['dept_id'], ':year' => $student['year'], ':semester' => $student['semester'], ':section' => $student['section'], ':dow' => $dow, ':now_time' => $nowTime]);
            $currentClass = $stmt->fetch() ?: null;

            $upcomingStmt = $this->pdo->prepare(
                'SELECT t.id, t.subject, t.start_time, t.end_time
                 FROM timetable t
                 JOIN courses_sections cs ON cs.id = t.course_id
                 WHERE cs.dept_id = :dept_id AND cs.year = :year AND cs.semester = :semester AND cs.section = :section
                   AND t.day_of_week = :dow AND t.start_time > :now_time
                 ORDER BY t.start_time LIMIT 5'
            );
            $upcomingStmt->execute([':dept_id' => $student['dept_id'], ':year' => $student['year'], ':semester' => $student['semester'], ':section' => $student['section'], ':dow' => $dow, ':now_time' => $nowTime]);
            $upcomingClasses = $upcomingStmt->fetchAll();
        } catch (Throwable $e) {
            $currentClass = null;
            $upcomingClasses = [];
        }

        try {
            $totalSessionsStmt = $this->pdo->prepare(
                'SELECT COUNT(*) AS c FROM attendance_sessions s JOIN courses_sections cs ON cs.id = s.course_id
                 WHERE cs.dept_id = :dept_id AND cs.year = :year AND cs.semester = :semester AND cs.section = :section'
            );
            $totalSessionsStmt->execute([':dept_id' => $student['dept_id'], ':year' => $student['year'], ':semester' => $student['semester'], ':section' => $student['section']]);
            $totalSessions = (int)($totalSessionsStmt->fetch()['c'] ?? 0);

            $presentStmt = $this->pdo->prepare("SELECT COUNT(*) AS c FROM attendance_records WHERE student_id = :student_id AND status = 'present'");
            $presentStmt->execute([':student_id' => $student['student_id']]);
            $presentCount = (int)($presentStmt->fetch()['c'] ?? 0);

            $recentStmt = $this->pdo->prepare(
                'SELECT ar.timestamp, ar.match_score, ar.status, sess.subject
                 FROM attendance_records ar
                 JOIN attendance_sessions sess ON sess.id = ar.session_id
                 WHERE ar.student_id = :student_id
                 ORDER BY ar.timestamp DESC LIMIT 5'
            );
            $recentStmt->execute([':student_id' => $student['student_id']]);
            $recentAttendance = $recentStmt->fetchAll();
        } catch (Throwable $e) {
            $totalSessions = 0;
            $presentCount = 0;
            $recentAttendance = [];
        }

        $attendancePercent = $totalSessions > 0 ? round(($presentCount / $totalSessions) * 100, 2) : 0.0;
        $faceRegistered = $this->resolveStudentFaceRegistrationState((int)$student['student_id'], $student['face_registered'] ?? null);

        json_response([
            'success' => true,
            'student' => [
                'name' => $student['name'], 'unique_user_id' => $student['unique_user_id'],
                'dept_name' => $student['dept_name'], 'course' => $student['course'],
                'year' => (int)$student['year'], 'semester' => (int)$student['semester'],
                'section' => $student['section'], 'face_registered' => $faceRegistered,
            ],
            'attendance' => ['present_count' => $presentCount, 'total_sessions' => $totalSessions, 'percent' => $attendancePercent],
            'current_class' => $currentClass,
            'upcoming_classes' => $upcomingClasses,
            'recent_attendance' => $recentAttendance,
        ]);
    }

    public function timetableWeekly(): void
    {
        Session::requireRole($this->sessionCtx, ['student']);
        $studentUserId = (int)$this->sessionCtx->currentUser['id'];
        $collegeId = (int)$this->sessionCtx->currentUser['college_id'];

        $stmt = $this->pdo->prepare(
            'SELECT s.dept_id, s.year, s.section, d.name AS dept_name, s.semester
             FROM students s
             LEFT JOIN departments d ON d.id = s.dept_id
             WHERE s.user_id = :uid LIMIT 1'
        );
        $stmt->execute([':uid' => $studentUserId]);
        $student = $stmt->fetch();
        if (!$student) { json_response(['success' => false, 'error' => 'Student profile not found'], 404); }

        $stmt = $this->pdo->prepare(
            'SELECT t.id, t.day_of_week, t.start_time, t.end_time, t.subject,
                    cs.course_name, cs.year, cs.semester, cs.section,
                    u.name AS faculty_name, u.unique_user_id AS faculty_unique_id
             FROM timetable t
             JOIN courses_sections cs ON cs.id = t.course_id
             LEFT JOIN faculty f ON f.faculty_id = t.faculty_id
             LEFT JOIN users u ON u.id = f.user_id
             WHERE t.college_id = :cid AND cs.dept_id = :dept_id AND cs.year = :year AND cs.semester = :semester AND cs.section = :section
             ORDER BY t.day_of_week ASC, t.start_time ASC'
        );
        $stmt->execute([':cid' => $collegeId, ':dept_id' => (int)$student['dept_id'], ':year' => (int)$student['year'], ':semester' => (int)$student['semester'], ':section' => $student['section']]);
        $rows = $stmt->fetchAll();

        json_response([
            'success' => true,
            'class' => ['department' => $student['dept_name'] ?? null, 'year' => (int)$student['year'], 'semester' => (int)$student['semester'], 'section' => $student['section']],
            'rows' => $rows,
        ]);
    }

    // ---- Face Registration (supports multi-embedding) ----
    public function faceRegister(): void
    {
        Session::requireRole($this->sessionCtx, ['student']);
        require_method('POST');
        $input = read_json_body();

        // Support both legacy single embedding and new multi-embedding format
        $multiEmbeddings = $input['embeddings'] ?? null; // [{embedding: [...], type: 'front', quality: 85}, ...]
        $singleEmbedding = normalize_embedding_vector($input['embedding_vector'] ?? null);

        if ($multiEmbeddings === null && $singleEmbedding === null) {
            json_response(['success' => false, 'error' => 'embedding_vector or embeddings[] is required'], 400);
        }

        // Memory & storage abuse protection: hard limit on how many embeddings one can send
        if (is_array($multiEmbeddings) && count($multiEmbeddings) > 10) {
            json_response(['success' => false, 'error' => 'Maximum of 10 face embeddings allowed per update'], 413);
        }

        ensure_face_registration_updates_table($this->pdo);

        $student = find_student_record_by_user(
            $this->pdo,
            (int)$this->sessionCtx->currentUser['id'],
            (int)$this->sessionCtx->currentUser['college_id']
        );
        if (!$student) { json_response(['success' => false, 'error' => 'Student profile not found'], 404); }
        $studentId = (int)$student['student_id'];
        $isUpdate = $this->resolveStudentFaceRegistrationState($studentId, $student['face_registered'] ?? null);

        if ($isUpdate) {
            $quota = $this->getFaceUpdateQuota($studentId);
            if (!$quota['can_update']) {
                json_response([
                    'success' => false,
                    'error' => 'Monthly face update limit reached. Try again next month.',
                    'monthly_update_limit' => (int)$quota['limit'],
                    'updates_used_this_month' => (int)$quota['used'],
                    'updates_remaining_this_month' => (int)$quota['remaining'],
                    'can_update_face' => false,
                    'next_reset_at' => $this->getFaceUpdateResetDate(),
                ], 429);
            }
        }

        // Use FaceVerificationService for storage (constructor can run migrations)
        $storedCount = 0;
        $embeddingSet = [];

        if (is_array($multiEmbeddings) && count($multiEmbeddings) > 0) {
            // Multi-embedding registration: store each angle individually
            // Check if format is a list of objects or a key-value map
            $isList = array_is_list($multiEmbeddings);

            foreach ($multiEmbeddings as $key => $item) {
                $vec = null;
                $type = 'front';
                $quality = null;

                if ($isList) {
                    // Format: [{type: 'front', embedding: [...]}]
                    $vec = normalize_embedding_vector($item['embedding'] ?? $item['vector'] ?? null);
                    $type = $item['type'] ?? 'front';
                    $quality = isset($item['quality']) ? (float)$item['quality'] : null;
                } else {
                    // Format from frontend: { front: [...], left: [...] }
                    $vec = normalize_embedding_vector($item);
                    $type = (string)$key;
                }

                if ($vec === null) continue;

                $embeddingSet[] = [
                    'embedding' => $vec,
                    'type' => $type,
                    'quality' => $quality,
                ];
            }

            if (empty($embeddingSet)) {
                json_response(['success' => false, 'error' => 'No valid embeddings provided'], 400);
            }
        } else {
            // Legacy single embedding — store as single front embedding
            $embeddingSet = [
                [
                    'embedding' => $singleEmbedding,
                    'type' => 'front',
                    'quality' => null,
                ]
            ];
        }

        try {
            require_once __DIR__ . '/../Services/FaceVerificationService.php';
            $faceService = new FaceVerificationService($this->pdo);
            $storedCount = $faceService->storeMultipleEmbeddings($studentId, $embeddingSet);
        } catch (Throwable $e) {
            error_log('face registration storage failed: ' . $e->getMessage());
            $errorMsg = 'Face registration could not be saved. Please verify the new database schema was imported correctly and the DB user has INSERT/ALTER permissions.';
            if (defined('APP_ENV') && APP_ENV !== 'production') {
                $errorMsg .= ' Error: ' . $e->getMessage();
            }
            json_response([
                'success' => false,
                'error' => $errorMsg,
                'error_details' => $e->getMessage(),
            ], 500);
        }
        if ($storedCount <= 0) {
            json_response([
                'success' => false,
                'error' => 'Face data was captured, but no valid face embeddings were generated. Please retry with a clear, well-lit face.',
            ], 422);
        }

        // Clear embedding cache
        FaceVerificationService::clearEmbeddingCache($studentId);

        // Update stored flag; don't fail registration if the students table is missing the column.
        try {
            $this->syncStudentFaceRegistrationFlag($studentId, true);
        } catch (Throwable $e) {
            error_log('face registration flag sync failed: ' . $e->getMessage());
        }

        // Track registration/update events, but don't fail face registration just because the audit log table is missing.
        try {
            $this->pdo->prepare('INSERT INTO face_registration_updates (student_id, action) VALUES (:sid, :action)')
                ->execute([':sid' => $studentId, ':action' => $isUpdate ? 'update' : 'register']);
        } catch (Throwable $e) {
            error_log('face registration update log failed: ' . $e->getMessage());
        }

        $quota = $this->getFaceUpdateQuota($studentId);

        $this->audit->log($this->sessionCtx->currentUser['id'], $isUpdate ? 'face_updated' : 'face_registered', [
            'student_id' => $studentId,
            'embeddings_count' => $storedCount,
        ]);
        json_response([
            'success' => true,
            'message' => $isUpdate ? 'Face updated successfully' : 'Face registered successfully',
            'face_registered' => true,
            'was_update' => $isUpdate,
            'embeddings_stored' => $storedCount,
            'monthly_update_limit' => (int)$quota['limit'],
            'updates_used_this_month' => (int)$quota['used'],
            'updates_remaining_this_month' => (int)$quota['remaining'],
            'can_update_face' => (bool)$quota['can_update'],
            'next_reset_at' => $this->getFaceUpdateResetDate(),
        ]);
    }

    public function faceProfile(): void
    {
        Session::requireRole($this->sessionCtx, ['student']);
        ensure_face_registration_updates_table($this->pdo);
        $row = find_student_record_by_user(
            $this->pdo,
            (int)$this->sessionCtx->currentUser['id'],
            (int)$this->sessionCtx->currentUser['college_id']
        );
        if (!$row) { json_response(['success' => false, 'error' => 'Student profile not found'], 404); }

        $studentId = (int)$row['student_id'];
        $faceRegistered = $this->resolveStudentFaceRegistrationState($studentId, $row['face_registered'] ?? null);
        $vector = $faceRegistered ? $this->getLatestFaceEmbeddingVector($studentId) : null;
        $quota = $this->getFaceUpdateQuota((int)$row['student_id']);
        $canUpdate = $faceRegistered ? (bool)$quota['can_update'] : true;

        json_response([
            'success' => true,
            'face_registered' => $faceRegistered,
            'embedding_vector' => $vector,
            'monthly_update_limit' => (int)$quota['limit'],
            'updates_used_this_month' => (int)$quota['used'],
            'updates_remaining_this_month' => (int)$quota['remaining'],
            'can_update_face' => $canUpdate,
            'next_reset_at' => $this->getFaceUpdateResetDate(),
        ]);
    }

    private function getFaceUpdateQuota(int $studentId): array
    {
        $limit = defined('FACE_MONTHLY_UPDATE_LIMIT') ? max(1, (int)FACE_MONTHLY_UPDATE_LIMIT) : 2;
        $monthStart = (new DateTimeImmutable('first day of this month 00:00:00'))->format('Y-m-d H:i:s');
        $monthEnd = (new DateTimeImmutable('first day of next month 00:00:00'))->format('Y-m-d H:i:s');

        $used = 0;
        try {
            $stmt = $this->pdo->prepare(
                'SELECT COUNT(*) AS c
                 FROM face_registration_updates
                 WHERE student_id = :sid
                   AND action = "update"
                   AND created_at >= :month_start
                   AND created_at < :month_end'
            );
            $stmt->execute([
                ':sid' => $studentId,
                ':month_start' => $monthStart,
                ':month_end' => $monthEnd,
            ]);
            $used = (int)($stmt->fetch()['c'] ?? 0);
        } catch (Throwable $e) {
            $used = 0;
        }

        $remaining = max(0, $limit - $used);

        return [
            'limit' => $limit,
            'used' => $used,
            'remaining' => $remaining,
            'can_update' => ($remaining > 0),
        ];
    }

    private function getFaceUpdateResetDate(): string
    {
        return (new DateTimeImmutable('first day of next month 00:00:00'))->format('Y-m-d H:i:s');
    }

    private function resolveStudentFaceRegistrationState(int $studentId, $storedFlag = null): bool
    {
        $hasEmbeddings = $this->studentHasFaceEmbeddings($studentId);
        if ($storedFlag !== null && (((int)$storedFlag === 1) !== $hasEmbeddings)) {
            $this->syncStudentFaceRegistrationFlag($studentId, $hasEmbeddings);
        }
        return $hasEmbeddings;
    }

    private function studentHasFaceEmbeddings(int $studentId): bool
    {
        $stmt = $this->pdo->prepare('SELECT 1 FROM face_embeddings WHERE student_id = :sid LIMIT 1');
        $stmt->execute([':sid' => $studentId]);
        return (bool)$stmt->fetchColumn();
    }

    private function getLatestFaceEmbeddingVector(int $studentId): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT embedding_vector
             FROM face_embeddings
             WHERE student_id = :sid
             ORDER BY registered_at DESC, id DESC
             LIMIT 1'
        );
        $stmt->execute([':sid' => $studentId]);
        $row = $stmt->fetch();
        if (!$row || empty($row['embedding_vector'])) {
            return null;
        }

        $decoded = json_decode($row['embedding_vector'], true);
        return is_array($decoded) ? $decoded : null;
    }

    private function syncStudentFaceRegistrationFlag(int $studentId, bool $registered): void
    {
        $stmt = $this->pdo->prepare('UPDATE students SET face_registered = :registered WHERE student_id = :sid');
        $stmt->execute([
            ':registered' => $registered ? 1 : 0,
            ':sid' => $studentId,
        ]);
    }
}
