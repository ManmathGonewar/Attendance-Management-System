<?php

class AttendanceController
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

    public function otpPreview(): void
    {
        Session::requireRole($this->sessionCtx, ['student']);
        $otp = trim((string)($_GET['otp'] ?? ''));
        if ($otp === '' || !preg_match('/^\d{6}$/', $otp)) {
            json_response(['success' => true, 'found' => false, 'session' => null]);
        }

        $collegeId = $this->sessionCtx->currentUser['college_id'];
        $student = find_student_record_by_user(
            $this->pdo,
            (int)$this->sessionCtx->currentUser['id'],
            (int)$this->sessionCtx->currentUser['college_id']
        );
        if (!$student) {
            json_response(['success' => false, 'error' => 'Student profile not found'], 404);
        }

        $stmt = $this->pdo->prepare(
            "SELECT s.id, s.subject, s.extra_reason, s.start_time, s.otp_expiry,
                    cs.course_name, cs.year, cs.semester, cs.section,
                    u.name AS faculty_name,
                    t.start_time AS scheduled_start, t.end_time AS scheduled_end
             FROM attendance_sessions s
             JOIN courses_sections cs ON cs.id = s.course_id
             JOIN faculty f ON f.faculty_id = s.faculty_id
             JOIN users u ON u.id = f.user_id
             LEFT JOIN timetable t ON t.college_id = s.college_id 
                AND t.faculty_id = s.faculty_id 
                AND t.course_id = s.course_id
                AND t.day_of_week = (WEEKDAY(s.start_time) + 1)
                AND (TIME(s.start_time) BETWEEN (t.start_time - INTERVAL 10 MINUTE) AND (t.end_time + INTERVAL 10 MINUTE))
             WHERE s.college_id = :cid AND s.status = 'active' AND s.otp_code = :otp AND s.otp_expiry >= NOW()
               AND cs.dept_id = :dept_id AND cs.year = :year AND cs.semester = :semester AND cs.section = :section
             ORDER BY s.start_time DESC LIMIT 1"
        );
        $stmt->execute([':cid' => $collegeId, ':otp' => $otp, ':dept_id' => (int)$student['dept_id'], ':year' => (int)$student['year'], ':semester' => (int)$student['semester'], ':section' => (string)$student['section']]);
        $session = $stmt->fetch();

        if (!$session) {
            json_response(['success' => true, 'found' => false, 'session' => null]);
        }

        json_response([
            'success' => true, 'found' => true,
            'session' => [
                'id' => (int)$session['id'], 'subject' => $session['subject'],
                'course_name' => $session['course_name'],
                'year' => isset($session['year']) ? (int)$session['year'] : null,
                'semester' => isset($session['semester']) ? (int)$session['semester'] : null,
                'section' => $session['section'], 'faculty_name' => $session['faculty_name'] ?? 'N/A',
                'extra_reason' => $session['extra_reason'] ?? null,
                'start_time' => $session['start_time'], 'otp_expiry' => $session['otp_expiry'],
                'scheduled_start' => $session['scheduled_start'], 'scheduled_end' => $session['scheduled_end']
            ],
        ]);
    }

    public function submitOtp(): void
    {
        Session::requireRole($this->sessionCtx, ['student']);
        require_method('POST');
        $input = read_json_body();
        $otp = trim($input['otp'] ?? '');
        if ($otp === '') {
            json_response(['success' => false, 'error' => 'OTP is required'], 400);
        }

        $collegeId = $this->sessionCtx->currentUser['college_id'];
        $student = find_student_record_by_user(
            $this->pdo,
            (int)$this->sessionCtx->currentUser['id'],
            $collegeId
        );
        if (!$student) {
            json_response(['success' => false, 'error' => 'Student profile not found'], 404);
        }
        $studentId = (int)$student['student_id'];

        $stmt = $this->pdo->prepare(
            "SELECT sess.id, sess.otp_code, sess.otp_expiry
             FROM attendance_sessions sess
             JOIN courses_sections cs ON cs.id = sess.course_id
             WHERE sess.college_id = :cid AND sess.status = 'active' AND sess.otp_code = :otp AND sess.otp_expiry >= NOW()
               AND cs.dept_id = :dept_id AND cs.year = :year AND cs.semester = :semester AND cs.section = :section
             ORDER BY sess.start_time DESC LIMIT 1"
        );
        $stmt->execute([
            ':cid' => $collegeId,
            ':otp' => $otp,
            ':dept_id' => (int)$student['dept_id'],
            ':year' => (int)$student['year'],
            ':semester' => (int)$student['semester'],
            ':section' => (string)$student['section'],
        ]);
        $session = $stmt->fetch();
        if (!$session) {
            // Simple brute-force protection: cap invalid OTP attempts per user in a rolling window.
            $userId = (int)$this->sessionCtx->currentUser['id'];
            $windowMinutes = 10;
            $maxAttempts = 5;

            $countStmt = $this->pdo->prepare(
                'SELECT COUNT(*) AS c
                 FROM audit_logs
                 WHERE user_id = :uid AND action = :action
                   AND timestamp >= DATE_SUB(NOW(), INTERVAL :mins MINUTE)'
            );
            $countStmt->bindValue(':uid', $userId, PDO::PARAM_INT);
            $countStmt->bindValue(':action', 'otp_invalid', PDO::PARAM_STR);
            $countStmt->bindValue(':mins', $windowMinutes, PDO::PARAM_INT);
            $countStmt->execute();
            $attempts = (int)($countStmt->fetch()['c'] ?? 0);

            // Log this invalid attempt
            $this->audit->log($userId, 'otp_invalid', ['otp' => $otp]);

            if ($attempts >= $maxAttempts) {
                json_response([
                    'success' => false,
                    'error' => 'Too many invalid OTP attempts. Please wait a few minutes before trying again.',
                ], 429);
            }

            json_response(['success' => false, 'error' => 'Invalid or expired OTP'], 400);
        }

        $this->pdo->prepare('INSERT INTO otp_logs (session_id, student_id, verified) VALUES (:sid, :stid, 1) ON DUPLICATE KEY UPDATE verified = 1, timestamp = NOW()')
            ->execute([':sid' => (int)$session['id'], ':stid' => $studentId]);

        $stmt = $this->pdo->prepare('SELECT status, match_score FROM attendance_records WHERE session_id = :sid AND student_id = :stid LIMIT 1');
        $stmt->execute([':sid' => (int)$session['id'], ':stid' => $studentId]);
        $existingAttendance = $stmt->fetch();
        if ($existingAttendance) {
            json_response([
                'success' => true, 'session_id' => (int)$session['id'], 'already_marked' => true,
                'status' => $existingAttendance['status'],
                'match_score' => isset($existingAttendance['match_score']) ? (float)$existingAttendance['match_score'] : null,
                'message' => 'Attendance already marked for this session',
            ]);
        }

        $this->pdo->prepare('INSERT INTO face_verification_attempts (session_id, student_id, attempts_used, last_match_score, last_decision, locked) VALUES (:sid, :stid, 0, NULL, NULL, 0) ON DUPLICATE KEY UPDATE updated_at = NOW()')
            ->execute([':sid' => (int)$session['id'], ':stid' => $studentId]);

        $this->audit->log($this->sessionCtx->currentUser['id'], 'otp_verified', ['session_id' => (int)$session['id']]);
        $faceConfig = FaceVerificationService::verificationConfig();
        json_response([
            'success' => true,
            'session_id' => (int)$session['id'],
            'attempts_left' => (int)$faceConfig['max_attempts'],
            'max_attempts' => (int)$faceConfig['max_attempts'],
            'accept_threshold' => (float)$faceConfig['accept_threshold'],
            'retry_threshold' => (float)$faceConfig['retry_threshold'],
        ]);
    }

    public function attendanceHistory(): void
    {
        Session::requireRole($this->sessionCtx, ['student']);
        $page = max(1, (int)($_GET['page'] ?? 1));
        $perPage = max(1, min(50, (int)($_GET['per_page'] ?? 10)));
        $offset = ($page - 1) * $perPage;

        $student = find_student_record_by_user(
            $this->pdo,
            (int)$this->sessionCtx->currentUser['id'],
            (int)$this->sessionCtx->currentUser['college_id']
        );
        if (!$student) {
            json_response(['success' => false, 'error' => 'Student profile not found'], 404);
        }

        $stmt = $this->pdo->prepare(
            'SELECT ar.id, ar.timestamp, ar.match_score, ar.status, ar.location_verified,
                    sess.subject,
                    CASE WHEN cls.college_id IS NULL THEN 0 ELSE 1 END AS location_configured
             FROM attendance_records ar
             JOIN attendance_sessions sess ON ar.session_id = sess.id
             LEFT JOIN college_location_settings cls ON cls.college_id = sess.college_id
             WHERE ar.student_id = :stid
             ORDER BY ar.timestamp DESC
             LIMIT :limit OFFSET :offset'
        );
        $stmt->bindValue(':stid', $student['student_id'], PDO::PARAM_INT);
        $stmt->bindValue(':limit', $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        json_response(['success' => true, 'records' => $stmt->fetchAll(), 'page' => $page, 'per_page' => $perPage]);
    }

    public function verifyFace(): void
    {
        Session::requireRole($this->sessionCtx, ['student']);
        require_method('POST');
        $input = read_json_body();
        $sessionId = isset($input['session_id']) ? (int)$input['session_id'] : 0;
        $liveEmbedding = $input['live_embedding'] ?? null;

        if ($sessionId <= 0 || !is_array($liveEmbedding)) {
            json_response(['success' => false, 'error' => 'session_id and live_embedding are required'], 400);
        }

        $stmt = $this->pdo->prepare("SELECT id, college_id, course_id FROM attendance_sessions WHERE id = :id AND status = 'active' LIMIT 1");
        $stmt->execute([':id' => $sessionId]);
        $session = $stmt->fetch();
        if (!$session) {
            json_response(['success' => false, 'error' => 'Session not active'], 400);
        }
        if ((int)$session['college_id'] !== (int)$this->sessionCtx->currentUser['college_id']) {
            json_response(['success' => false, 'error' => 'Invalid session'], 400);
        }

        $student = find_student_record_by_user(
            $this->pdo,
            (int)$this->sessionCtx->currentUser['id'],
            (int)$this->sessionCtx->currentUser['college_id']
        );
        if (!$student) {
            json_response(['success' => false, 'error' => 'Student profile not found'], 404);
        }
        $studentId = (int)$student['student_id'];

        $classCheck = $this->pdo->prepare('SELECT 1 FROM courses_sections cs WHERE cs.id = :course_id AND cs.dept_id = :dept_id AND cs.year = :year AND cs.semester = :semester AND cs.section = :section LIMIT 1');
        $classCheck->execute([':course_id' => (int)$session['course_id'], ':dept_id' => (int)$student['dept_id'], ':year' => (int)$student['year'], ':semester' => (int)$student['semester'], ':section' => (string)$student['section']]);
        if (!$classCheck->fetch()) {
            json_response(['success' => false, 'error' => 'This OTP/session is not for your class'], 403);
        }

        $stmt = $this->pdo->prepare('SELECT verified FROM otp_logs WHERE session_id = :sid AND student_id = :stid LIMIT 1');
        $stmt->execute([':sid' => $sessionId, ':stid' => $studentId]);
        $otpLog = $stmt->fetch();
        if (!$otpLog || (int)$otpLog['verified'] !== 1) {
            json_response(['success' => false, 'error' => 'OTP not verified'], 400);
        }

        $faceService = new FaceVerificationService($this->pdo);
        $result = $faceService->verifyFace($sessionId, $studentId, $liveEmbedding);

        $decisionRaw = strtoupper((string)($result['decision'] ?? 'REJECT'));
        // Default match_score to 0.0 so we never skip a valid decision branch
        $matchScore = array_key_exists('match_score', $result) ? (float)$result['match_score'] : 0.0;
        $attemptsRemaining = array_key_exists('attempts_remaining', $result) ? (int)$result['attempts_remaining'] : null;
        $message = (string)($result['message'] ?? $result['error'] ?? 'Face verification failed');
        $faceConfig = FaceVerificationService::verificationConfig();
        $thresholdPayload = [
            'accept_threshold' => (float)$faceConfig['accept_threshold'],
            'retry_threshold' => (float)$faceConfig['retry_threshold'],
            'max_attempts' => (int)$faceConfig['max_attempts'],
        ];

        if ($decisionRaw === 'ACCEPT') {
            json_response([
                'success' => true,
                'match_score' => $matchScore,
                'decision' => 'ACCEPT',
                'message' => $message ?: 'Face verified successfully',
                'attempts_remaining' => $attemptsRemaining,
                ...$thresholdPayload,
            ]);
        }
        if (in_array($decisionRaw, ['RETRY', 'REJECT', 'REJECTED'], true)) {
            json_response([
                'success' => false,
                'match_score' => $matchScore,
                'decision' => ($decisionRaw === 'RETRY') ? 'RETRY' : 'REJECT',
                'message' => $message,
                'attempts_remaining' => $attemptsRemaining,
                ...$thresholdPayload,
            ]);
        }
        if ($decisionRaw === 'LOCKED') {
            json_response([
                'success' => false,
                'match_score' => $matchScore,
                'error' => $message,
                'decision' => 'LOCKED',
                'attempts_remaining' => $attemptsRemaining,
                ...$thresholdPayload,
            ], 429);
        }
        // Fallback — unknown decision, still return match_score
        json_response([
            'success' => false,
            'match_score' => $matchScore,
            'error' => $message,
            'decision' => strtoupper($decisionRaw),
            ...$thresholdPayload,
        ], 400);
    }

    public function verifyLocation(): void
    {
        Session::requireRole($this->sessionCtx, ['student']);
        require_method('POST');
        $input = read_json_body();
        $sessionId = isset($input['session_id']) ? (int)$input['session_id'] : 0;
        $latitude = isset($input['latitude']) ? (float)$input['latitude'] : null;
        $longitude = isset($input['longitude']) ? (float)$input['longitude'] : null;

        if ($sessionId <= 0 || $latitude === null || $longitude === null) {
            json_response(['success' => false, 'error' => 'session_id, latitude, and longitude are required'], 400);
        }

        $stmt = $this->pdo->prepare('SELECT college_id FROM attendance_sessions WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $sessionId]);
        $session = $stmt->fetch();
        if (!$session) {
            json_response(['success' => false, 'error' => 'Session not found'], 404);
        }

        // Enforce strict pipeline: OTP must be verified before location can be used.
        $student = find_student_record_by_user(
            $this->pdo,
            (int)$this->sessionCtx->currentUser['id'],
            (int)$this->sessionCtx->currentUser['college_id']
        );
        if (!$student) {
            json_response(['success' => false, 'error' => 'Student profile not found'], 404);
        }
        $studentId = (int)$student['student_id'];

        // Removed OTP verification check to allow location verification before OTP submission
        // $otpStmt = $this->pdo->prepare('SELECT verified FROM otp_logs WHERE session_id = :sid AND student_id = :stid LIMIT 1');
        // $otpStmt->execute([':sid' => $sessionId, ':stid' => $studentId]);
        // $otpLog = $otpStmt->fetch();
        // if (!$otpLog || (int)$otpLog['verified'] !== 1) {
        //     json_response(['success' => false, 'error' => 'OTP not verified'], 400);
        // }

        $faceService = new FaceVerificationService($this->pdo);
        $result = $faceService->verifyLocation((int)$session['college_id'], $latitude, $longitude);

        if (!$result['success']) {
            json_response(['success' => false, 'error' => $result['message']], 400);
        }
        json_response(['success' => true, 'message' => $result['message'], 'distance' => $result['distance'] ?? null, 'radius' => $result['radius'] ?? null]);
    }

    public function markAttendance(): void
    {
        Session::requireRole($this->sessionCtx, ['student']);
        require_method('POST');
        $input = read_json_body();
        $sessionId = isset($input['session_id']) ? (int)$input['session_id'] : 0;
        $latitude = array_key_exists('latitude', $input) ? (float)$input['latitude'] : null;
        $longitude = array_key_exists('longitude', $input) ? (float)$input['longitude'] : null;

        if ($sessionId <= 0 || $latitude === null || $longitude === null) {
            json_response(['success' => false, 'error' => 'session_id, latitude, and longitude are required'], 400);
        }

        $stmt = $this->pdo->prepare("SELECT id, college_id, course_id FROM attendance_sessions WHERE id = :id AND status = 'active' LIMIT 1");
        $stmt->execute([':id' => $sessionId]);
        $session = $stmt->fetch();
        if (!$session) {
            json_response(['success' => false, 'error' => 'Session not active'], 400);
        }
        if ((int)$session['college_id'] !== (int)$this->sessionCtx->currentUser['college_id']) {
            json_response(['success' => false, 'error' => 'Invalid session'], 400);
        }

        $student = find_student_record_by_user(
            $this->pdo,
            (int)$this->sessionCtx->currentUser['id'],
            (int)$this->sessionCtx->currentUser['college_id']
        );
        if (!$student) {
            json_response(['success' => false, 'error' => 'Student profile not found'], 404);
        }
        $studentId = (int)$student['student_id'];

        $classCheck = $this->pdo->prepare('SELECT 1 FROM courses_sections cs WHERE cs.id = :course_id AND cs.dept_id = :dept_id AND cs.year = :year AND cs.semester = :semester AND cs.section = :section LIMIT 1');
        $classCheck->execute([':course_id' => (int)$session['course_id'], ':dept_id' => (int)$student['dept_id'], ':year' => (int)$student['year'], ':semester' => (int)$student['semester'], ':section' => (string)$student['section']]);
        if (!$classCheck->fetch()) {
            json_response(['success' => false, 'error' => 'This OTP/session is not for your class'], 403);
        }

        $stmt = $this->pdo->prepare('SELECT verified FROM otp_logs WHERE session_id = :sid AND student_id = :stid LIMIT 1');
        $stmt->execute([':sid' => $sessionId, ':stid' => $studentId]);
        $otpLog = $stmt->fetch();
        if (!$otpLog || (int)$otpLog['verified'] !== 1) {
            json_response(['success' => false, 'error' => 'OTP not verified'], 400);
        }

        $stmt = $this->pdo->prepare('SELECT id FROM attendance_records WHERE session_id = :sid AND student_id = :stid LIMIT 1');
        $stmt->execute([':sid' => $sessionId, ':stid' => $studentId]);
        if ($stmt->fetch()) {
            json_response(['success' => false, 'error' => 'Attendance already marked'], 409);
        }

        $stmt = $this->pdo->prepare('SELECT last_match_score, last_decision, locked FROM face_verification_attempts WHERE session_id = :sid AND student_id = :stid LIMIT 1');
        $stmt->execute([':sid' => $sessionId, ':stid' => $studentId]);
        $attempt = $stmt->fetch();
        $lastDecision = strtoupper((string)($attempt['last_decision'] ?? ''));
        if ($lastDecision !== 'ACCEPT') {
            json_response(['success' => false, 'error' => 'Face not verified for this session'], 400);
        }
        $matchScore = (float)($attempt['last_match_score'] ?? 0.0);

        $faceService = new FaceVerificationService($this->pdo);
        $loc = $faceService->verifyLocation((int)$session['college_id'], (float)$latitude, (float)$longitude);
        if (($loc['configured'] ?? false) === true && !$loc['success']) {
            json_response(['success' => false, 'error' => $loc['message'] ?? 'You are outside the permitted campus area', 'distance' => $loc['distance'] ?? null, 'radius' => $loc['radius'] ?? null], 400);
        }

        $locationPayload = ['lat' => (float)$latitude, 'lng' => (float)$longitude, 'verified' => (($loc['configured'] ?? false) === true) && ($loc['success'] ?? false)];
        $result = $faceService->markAttendance($sessionId, $studentId, $matchScore, $locationPayload);

        if (!$result['success']) {
            json_response(['success' => false, 'error' => $result['error']], 409);
        }

        $this->audit->log($this->sessionCtx->currentUser['id'], 'attendance_marked', [
            'session_id' => $sessionId, 'match_score' => $matchScore, 'location_verified' => $locationPayload['verified'] ? 1 : 0,
        ]);
        json_response([
            'success' => true, 'message' => $result['message'] ?? 'Attendance marked successfully',
            'status' => $result['status'] ?? 'PRESENT', 'match_score' => $matchScore,
            'location_verified' => $locationPayload['verified'] ? 1 : 0,
            'location_configured' => (bool)($loc['configured'] ?? false),
            'distance' => $loc['distance'] ?? null, 'radius' => $loc['radius'] ?? null,
        ]);
    }

    public function criteriaFilters(): void
    {
        Session::requireRole($this->sessionCtx, ['college_admin']);
        $collegeId = (int)$this->sessionCtx->currentUser['college_id'];
        $deptId = isset($_GET['dept_id']) ? (int)$_GET['dept_id'] : 0;
        $year = isset($_GET['year']) ? (int)$_GET['year'] : 0;
        $semester = isset($_GET['semester']) ? (int)$_GET['semester'] : 0;

        $departmentsStmt = $this->pdo->prepare("SELECT DISTINCT d.id, d.name FROM students s JOIN users u ON u.id = s.user_id JOIN departments d ON d.id = s.dept_id WHERE u.college_id = :cid AND d.status = 'active' ORDER BY d.name");
        $departmentsStmt->execute([':cid' => $collegeId]);
        $departments = $departmentsStmt->fetchAll();

        $where = ['u.college_id = :cid'];
        $params = [':cid' => $collegeId];
        if ($deptId > 0) {
            $where[] = 's.dept_id = :dept_id';
            $params[':dept_id'] = $deptId;
        }
        if ($year > 0) {
            $where[] = 's.year = :year';
            $params[':year'] = $year;
        }
        if ($semester > 0) {
            $where[] = 's.semester = :semester';
            $params[':semester'] = $semester;
        }

        $yearsStmt = $this->pdo->prepare('SELECT DISTINCT s.year FROM students s JOIN users u ON u.id = s.user_id WHERE ' . implode(' AND ', $where) . ' ORDER BY s.year');
        $yearsStmt->execute($params);
        $years = array_map(static fn($r) => (int)$r['year'], $yearsStmt->fetchAll());

        $semStmt = $this->pdo->prepare('SELECT DISTINCT s.semester FROM students s JOIN users u ON u.id = s.user_id WHERE ' . implode(' AND ', $where) . ' ORDER BY s.semester');
        $semStmt->execute($params);
        $semesters = array_map(static fn($r) => (int)$r['semester'], $semStmt->fetchAll());

        $sectionStmt = $this->pdo->prepare('SELECT DISTINCT s.section FROM students s JOIN users u ON u.id = s.user_id WHERE ' . implode(' AND ', $where) . ' ORDER BY s.section');
        $sectionStmt->execute($params);
        $sections = array_map(static fn($r) => (string)$r['section'], $sectionStmt->fetchAll());

        json_response(['success' => true, 'filters' => ['departments' => $departments, 'years' => $years, 'semesters' => $semesters, 'sections' => $sections]]);
    }

    public function semesterCriteria(): void
    {
        Session::requireRole($this->sessionCtx, ['college_admin']);
        $collegeId = (int)$this->sessionCtx->currentUser['college_id'];
        $deptId = isset($_GET['dept_id']) ? (int)$_GET['dept_id'] : 0;
        $year = isset($_GET['year']) ? (int)$_GET['year'] : 0;
        $semester = isset($_GET['semester']) ? (int)$_GET['semester'] : 0;
        $section = trim((string)($_GET['section'] ?? ''));
        $mode = trim((string)($_GET['mode'] ?? 'all'));
        $from = trim((string)($_GET['from'] ?? ''));
        $to = trim((string)($_GET['to'] ?? ''));

        $where = ['u.college_id = :cid'];
        $params = [':cid' => $collegeId];
        if ($deptId > 0) {
            $where[] = 's.dept_id = :dept_id';
            $params[':dept_id'] = $deptId;
        }
        if ($year > 0) {
            $where[] = 's.year = :year';
            $params[':year'] = $year;
        }
        if ($semester > 0) {
            $where[] = 's.semester = :semester';
            $params[':semester'] = $semester;
        }
        if ($section !== '') {
            $where[] = 's.section = :section';
            $params[':section'] = $section;
        }

        $studentsStmt = $this->pdo->prepare(
            'SELECT s.student_id, u.unique_user_id AS student_unique_id, u.name AS student_name,
                    s.dept_id, d.name AS dept_name, s.year, s.semester, s.section
             FROM students s JOIN users u ON u.id = s.user_id LEFT JOIN departments d ON d.id = s.dept_id
             WHERE ' . implode(' AND ', $where) . ' ORDER BY d.name, s.year, s.semester, s.section, u.name'
        );
        $studentsStmt->execute($params);
        $students = $studentsStmt->fetchAll();

        $dateWhere = '';
        if ($mode === 'today') {
            $dateWhere = ' AND DATE(sess.start_time) = CURDATE()';
        }
        elseif ($mode === 'yesterday') {
            $dateWhere = ' AND DATE(sess.start_time) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)';
        }
        else {
            if ($from !== '') {
                $dateWhere .= ' AND DATE(sess.start_time) >= :from';
            }
            if ($to !== '') {
                $dateWhere .= ' AND DATE(sess.start_time) <= :to';
            }
        }

        $rows = [];
        $classTotalCache = [];
        $eligibleCount = 0;
        $belowCount = 0;

        $presentSql = "SELECT COUNT(*) AS c FROM attendance_records ar JOIN attendance_sessions sess ON sess.id = ar.session_id JOIN courses_sections cs ON cs.id = sess.course_id WHERE ar.student_id = :student_id AND ar.status = 'present' AND cs.dept_id = :dept_id AND cs.year = :year AND cs.semester = :semester AND cs.section = :section" . $dateWhere;
        $presentStmt = $this->pdo->prepare($presentSql);

        foreach ($students as $st) {
            $classKey = implode('|', [(int)$st['dept_id'], (int)$st['year'], (int)$st['semester'], (string)$st['section'], $mode, $from, $to]);

            if (!array_key_exists($classKey, $classTotalCache)) {
                $totalSql = "SELECT COUNT(*) AS c FROM attendance_sessions sess JOIN courses_sections cs ON cs.id = sess.course_id WHERE sess.college_id = :cid AND cs.dept_id = :dept_id AND cs.year = :year AND cs.semester = :semester AND cs.section = :section" . $dateWhere;
                $totalStmt = $this->pdo->prepare($totalSql);
                $tp = [':cid' => $collegeId, ':dept_id' => (int)$st['dept_id'], ':year' => (int)$st['year'], ':semester' => (int)$st['semester'], ':section' => (string)$st['section']];
                if ($mode === 'all') {
                    if ($from !== '')
                        $tp[':from'] = $from;
                    if ($to !== '')
                        $tp[':to'] = $to;
                }
                $totalStmt->execute($tp);
                $classTotalCache[$classKey] = (int)($totalStmt->fetch()['c'] ?? 0);
            }

            $totalSessions = (int)$classTotalCache[$classKey];
            $pp = [':student_id' => (int)$st['student_id'], ':dept_id' => (int)$st['dept_id'], ':year' => (int)$st['year'], ':semester' => (int)$st['semester'], ':section' => (string)$st['section']];
            if ($mode === 'all') {
                if ($from !== '')
                    $pp[':from'] = $from;
                if ($to !== '')
                    $pp[':to'] = $to;
            }
            $presentStmt->execute($pp);
            $present = (int)($presentStmt->fetch()['c'] ?? 0);
            $percent = $totalSessions > 0 ? round(($present / $totalSessions) * 100, 2) : 0.0;
            $eligible = ($percent >= 75.0);
            if ($eligible) {
                $eligibleCount += 1;
            }
            else {
                $belowCount += 1;
            }

            $rows[] = [
                'student_unique_id' => $st['student_unique_id'], 'student_name' => $st['student_name'],
                'dept_name' => $st['dept_name'], 'year' => (int)$st['year'], 'semester' => (int)$st['semester'],
                'section' => $st['section'], 'present_count' => $present, 'total_sessions' => $totalSessions,
                'percent' => $percent, 'criteria_status' => $eligible ? 'eligible' : 'below_75',
            ];
        }

        json_response(['success' => true, 'summary' => ['eligible_count' => $eligibleCount, 'below_75_count' => $belowCount, 'total_students' => count($rows)], 'rows' => $rows]);
    }

    public function recordsView(): void
    {
        Session::requireRole($this->sessionCtx, ['faculty', 'college_admin']);
        $role = (string)$this->sessionCtx->currentUser['role'];
        $collegeId = (int)$this->sessionCtx->currentUser['college_id'];
        $mode = trim((string)($_GET['mode'] ?? 'today'));
        $from = trim((string)($_GET['from'] ?? ''));
        $to = trim((string)($_GET['to'] ?? ''));

        $where = ['s.college_id = :cid'];
        $params = [':cid' => $collegeId];

        if ($role === 'faculty') {
            $stmt = $this->pdo->prepare('SELECT faculty_id FROM faculty WHERE user_id = :uid LIMIT 1');
            $stmt->execute([':uid' => $this->sessionCtx->currentUser['id']]);
            $faculty = $stmt->fetch();
            if (!$faculty) {
                json_response(['success' => false, 'error' => 'Faculty profile not found'], 404);
            }
            $where[] = 's.faculty_id = :fid';
            $params[':fid'] = (int)$faculty['faculty_id'];
        }

        if ($mode === 'yesterday') {
            $where[] = 'DATE(s.start_time) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)';
        }
        elseif ($mode === 'all') {
            if ($from !== '') {
                $where[] = 'DATE(s.start_time) >= :from';
                $params[':from'] = $from;
            }
            if ($to !== '') {
                $where[] = 'DATE(s.start_time) <= :to';
                $params[':to'] = $to;
            }
        }
        else {
            if ($from !== '' || $to !== '') {
                if ($from !== '') {
                    $where[] = 'DATE(s.start_time) >= :from';
                    $params[':from'] = $from;
                }
                if ($to !== '') {
                    $where[] = 'DATE(s.start_time) <= :to';
                    $params[':to'] = $to;
                }
            }
            else {
                $where[] = 'DATE(s.start_time) = CURDATE()';
            }
        }

        $sql = 'SELECT DATE(s.start_time) AS session_date, s.id AS session_id, s.subject, s.extra_reason,
                       cs.course_name, cs.year, cs.semester, cs.section,
                       fu.name AS faculty_name, su.unique_user_id AS student_unique_id, su.name AS student_name,
                       ar.status AS raw_status, ar.match_score, ar.location_verified, ar.timestamp AS attendance_timestamp
                FROM attendance_sessions s
                JOIN courses_sections cs ON cs.id = s.course_id
                JOIN faculty f ON f.faculty_id = s.faculty_id
                JOIN users fu ON fu.id = f.user_id
                JOIN students st ON st.dept_id = cs.dept_id AND st.year = cs.year AND st.semester = cs.semester AND st.section = cs.section
                JOIN users su ON su.id = st.user_id
                LEFT JOIN attendance_records ar ON ar.session_id = s.id AND ar.student_id = st.student_id
                WHERE ' . implode(' AND ', $where) . '
                ORDER BY s.start_time DESC, cs.course_name ASC, su.name ASC';

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        $presentCount = 0;
        $absentCount = 0;
        foreach ($rows as &$row) {
            $isPresent = (($row['raw_status'] ?? '') === 'present');
            $row['attendance_status'] = $isPresent ? 'present' : 'absent';
            $row['match_score'] = ($row['match_score'] !== null) ? (float)$row['match_score'] : null;
            if ($isPresent) {
                $presentCount += 1;
            }
            else {
                $absentCount += 1;
            }
        }
        unset($row);

        json_response([
            'success' => true,
            'summary' => ['present_count' => $presentCount, 'absent_count' => $absentCount, 'total_count' => $presentCount + $absentCount],
            'rows' => $rows,
        ]);
    }
}