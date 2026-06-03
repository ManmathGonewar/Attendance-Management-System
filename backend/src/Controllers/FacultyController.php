<?php

class FacultyController
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

    private function getFacultyId(): int
    {
        $stmt = $this->pdo->prepare('SELECT faculty_id FROM faculty WHERE user_id = ? LIMIT 1');
        $stmt->execute([$this->sessionCtx->currentUser['id']]);
        $faculty = $stmt->fetch();
        if (!$faculty) {
            json_response(['success' => false, 'error' => 'Faculty profile not found'], 404);
        }
        return (int)$faculty['faculty_id'];
    }

    private function getFacultyProfile(): array
    {
        $stmt = $this->pdo->prepare('SELECT faculty_id, dept_id FROM faculty WHERE user_id = ? LIMIT 1');
        $stmt->execute([$this->sessionCtx->currentUser['id']]);
        $faculty = $stmt->fetch();
        if (!$faculty) {
            json_response(['success' => false, 'error' => 'Faculty profile not found'], 404);
        }
        return $faculty;
    }

    public function classesToday(): void
    {
        Session::requireRole($this->sessionCtx, ['faculty']);
        $collegeId = $this->sessionCtx->currentUser['college_id'];
        $dow = (int)date('N');
        $facultyId = $this->getFacultyId();

        $stmt = $this->pdo->prepare(
            'SELECT t.id, t.subject, t.start_time, t.end_time, cs.id AS course_id, cs.course_name, cs.year, cs.semester, cs.section
             FROM timetable t
             JOIN courses_sections cs ON t.course_id = cs.id
             WHERE t.college_id = :cid AND t.faculty_id = :fid AND t.day_of_week = :dow
             ORDER BY t.start_time'
        );
        $stmt->execute([':cid' => $collegeId, ':fid' => $facultyId, ':dow' => $dow]);
        json_response(['success' => true, 'classes' => $stmt->fetchAll()]);
    }

    public function classOptions(): void
    {
        Session::requireRole($this->sessionCtx, ['faculty']);
        $collegeId = $this->sessionCtx->currentUser['college_id'];
        $facultyId = $this->getFacultyId();

        $stmt = $this->pdo->prepare(
            'SELECT cs.id, cs.course_name, cs.year, cs.semester, cs.section, d.name AS dept_name,
                    COALESCE(MIN(NULLIF(TRIM(t.subject), "")), cs.course_name) AS default_subject
             FROM timetable t
             JOIN courses_sections cs ON cs.id = t.course_id
             JOIN departments d ON d.id = cs.dept_id
             WHERE t.college_id = ? AND t.faculty_id = ?
             GROUP BY cs.id, cs.course_name, cs.year, cs.semester, cs.section, d.name
             ORDER BY cs.year, cs.semester, cs.section, cs.course_name, default_subject'
        );
        $stmt->execute([$collegeId, $facultyId]);
        json_response(['success' => true, 'classes' => $stmt->fetchAll()]);
    }

    public function departmentStudentsList(): void
    {
        Session::requireRole($this->sessionCtx, ['faculty']);
        $collegeId = (int)$this->sessionCtx->currentUser['college_id'];
        $q = trim((string)($_GET['q'] ?? ''));
        $year = isset($_GET['year']) ? (int)$_GET['year'] : 0;
        $semester = isset($_GET['semester']) ? (int)$_GET['semester'] : 0;
        $section = trim((string)($_GET['section'] ?? ''));

        $stmt = $this->pdo->prepare('SELECT dept_id FROM faculty WHERE user_id = :uid LIMIT 1');
        $stmt->execute([':uid' => $this->sessionCtx->currentUser['id']]);
        $faculty = $stmt->fetch();
        if (!$faculty) {
            json_response(['success' => false, 'error' => 'Faculty profile not found'], 404);
        }
        $deptId = (int)$faculty['dept_id'];
        if ($deptId <= 0) {
            json_response(['success' => false, 'error' => 'Department not assigned'], 400);
        }

        $deptStmt = $this->pdo->prepare('SELECT name FROM departments WHERE id = :id LIMIT 1');
        $deptStmt->execute([':id' => $deptId]);
        $dept = $deptStmt->fetch();

        $where = ['u.college_id = :cid', "u.role = 'student'", 'u.deleted_at IS NULL', 's.dept_id = :dept_id'];
        $params = [':cid' => $collegeId, ':dept_id' => $deptId];
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
        if ($q !== '') {
            $where[] = '(u.name LIKE :q OR u.unique_user_id LIKE :q OR u.email LIKE :q OR s.course LIKE :q)';
            $params[':q'] = '%' . $q . '%';
        }

        $sql = 'SELECT u.id AS user_id, u.unique_user_id, u.name, u.email, u.status, s.student_id, s.course, s.year, s.semester, s.section, s.face_registered FROM users u JOIN students s ON s.user_id = u.id WHERE ' . implode(' AND ', $where) . ' ORDER BY s.year ASC, s.semester ASC, s.section ASC, u.name ASC';
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        json_response(['success' => true, 'department' => ['id' => $deptId, 'name' => $dept['name'] ?? null], 'students' => $stmt->fetchAll()]);
    }

    public function studentProfileGet(): void
    {
        Session::requireRole($this->sessionCtx, ['faculty']);
        $collegeId = (int)$this->sessionCtx->currentUser['college_id'];
        $studentUserId = isset($_GET['user_id']) ? (int)$_GET['user_id'] : 0;
        if ($studentUserId <= 0) {
            json_response(['success' => false, 'error' => 'user_id is required'], 400);
        }

        $faculty = $this->getFacultyProfile();
        $deptId = (int)$faculty['dept_id'];
        if ($deptId <= 0) {
            json_response(['success' => false, 'error' => 'Department not assigned'], 400);
        }

        $stmt = $this->pdo->prepare(
            'SELECT u.id AS user_id, u.unique_user_id, u.name, u.email, u.status,
                    COALESCE(u.profile_photo_data, u.profile_photo_path) AS profile_photo_url,
                    s.student_id, s.course, s.year, s.semester, s.section, s.face_registered,
                    d.name AS dept_name
             FROM users u
             JOIN students s ON s.user_id = u.id
             JOIN departments d ON d.id = s.dept_id
             WHERE u.id = :uid AND u.college_id = :cid AND u.role = "student" AND u.deleted_at IS NULL AND s.dept_id = :dept_id
             LIMIT 1'
        );
        $stmt->execute([':uid' => $studentUserId, ':cid' => $collegeId, ':dept_id' => $deptId]);
        $row = $stmt->fetch();
        if (!$row) {
            json_response(['success' => false, 'error' => 'Student not found'], 404);
        }
        json_response(['success' => true, 'student' => $row]);
    }

    public function timetableWeekly(): void
    {
        Session::requireRole($this->sessionCtx, ['faculty']);
        $collegeId = (int)$this->sessionCtx->currentUser['college_id'];
        $faculty = $this->getFacultyProfile();
        $facultyId = (int)$faculty['faculty_id'];
        $deptId = (int)$faculty['dept_id'];

        $stmt = $this->pdo->prepare(
            'SELECT t.id, t.day_of_week, t.start_time, t.end_time, t.subject,
                    cs.year, cs.semester, cs.section, cs.course_name,
                    u.name AS faculty_name, u.unique_user_id AS faculty_unique_id,
                    (CASE WHEN t.faculty_id = :my_faculty_id THEN 1 ELSE 0 END) AS is_mine
             FROM timetable t
             JOIN courses_sections cs ON cs.id = t.course_id
             JOIN faculty f ON f.faculty_id = t.faculty_id
             JOIN users u ON u.id = f.user_id
             WHERE t.college_id = :cid AND cs.dept_id = :dept_id
             ORDER BY t.day_of_week, t.start_time, t.end_time, cs.year, cs.semester, cs.section'
        );
        $stmt->execute([':my_faculty_id' => $facultyId, ':cid' => $collegeId, ':dept_id' => $deptId]);
        $rows = $stmt->fetchAll();

        $deptStmt = $this->pdo->prepare('SELECT name FROM departments WHERE id = :id LIMIT 1');
        $deptStmt->execute([':id' => $deptId]);
        $dept = $deptStmt->fetch();

        json_response(['success' => true, 'department' => ['id' => $deptId, 'name' => $dept['name'] ?? null], 'rows' => $rows]);
    }

    public function activeSession(): void
    {
        Session::requireRole($this->sessionCtx, ['faculty']);
        $facultyId = $this->getFacultyId();

        $stmt = $this->pdo->prepare(
            "SELECT s.id, s.subject, s.otp_code, s.otp_expiry, s.start_time,
                    s.extra_reason,
                    cs.course_name, cs.year, cs.semester, cs.section, cs.dept_id,
                    t.start_time AS slot_start_time, t.end_time AS slot_end_time,
                    (CASE
                        WHEN COALESCE(NULLIF(TRIM(s.extra_reason), ''), '') <> '' THEN 1
                        WHEN t.id IS NULL THEN 1
                        ELSE 0
                    END) AS is_extra_class
             FROM attendance_sessions s
             LEFT JOIN courses_sections cs ON cs.id = s.course_id
             LEFT JOIN timetable t
               ON t.college_id = s.college_id
              AND t.faculty_id = s.faculty_id
              AND t.course_id = s.course_id
              AND t.day_of_week = (WEEKDAY(s.start_time) + 1)
              AND TIME(s.start_time) BETWEEN t.start_time AND t.end_time
             WHERE s.faculty_id = :fid AND s.status = 'active'
             ORDER BY s.start_time DESC
             LIMIT 1"
        );
        $stmt->execute([':fid' => $facultyId]);
        $session = $stmt->fetch();

        if ($session) {
            $presentStmt = $this->pdo->prepare("SELECT COUNT(*) AS c FROM attendance_records WHERE session_id = :sid AND status = 'present'");
            $presentStmt->execute([':sid' => $session['id']]);
            $presentCount = (int)($presentStmt->fetch()['c'] ?? 0);

            $totalStmt = $this->pdo->prepare('SELECT COUNT(*) AS c FROM students WHERE dept_id = :dept AND year = :year AND semester = :semester AND section = :section');
            $totalStmt->execute([':dept' => $session['dept_id'], ':year' => $session['year'], ':semester' => $session['semester'], ':section' => $session['section']]);
            $totalStudents = (int)($totalStmt->fetch()['c'] ?? 0);

            $session['present_count'] = $presentCount;
            $session['absent_count'] = max(0, $totalStudents - $presentCount);
            $session['total_students'] = $totalStudents;
            unset($session['dept_id']);
        }

        json_response(['success' => true, 'session' => $session ?: null]);
    }

    public function recentSessions(): void
    {
        Session::requireRole($this->sessionCtx, ['faculty']);
        $facultyId = $this->getFacultyId();

        $stmt = $this->pdo->prepare(
            "SELECT s.id, s.subject, s.extra_reason, s.start_time, s.status,
                    cs.course_name, cs.year, cs.semester, cs.section, cs.dept_id
             FROM attendance_sessions s
             JOIN courses_sections cs ON cs.id = s.course_id
             WHERE s.faculty_id = :fid
             ORDER BY s.start_time DESC
             LIMIT 10"
        );
        $stmt->execute([':fid' => $facultyId]);
        $sessions = $stmt->fetchAll();

        $presentStmt = $this->pdo->prepare("SELECT COUNT(*) AS c FROM attendance_records WHERE session_id = :sid AND status = 'present'");
        $totalStmt = $this->pdo->prepare('SELECT COUNT(*) AS c FROM students WHERE dept_id = :dept AND year = :year AND semester = :semester AND section = :section');

        foreach ($sessions as &$row) {
            $presentStmt->execute([':sid' => $row['id']]);
            $presentCount = (int)($presentStmt->fetch()['c'] ?? 0);
            $totalStmt->execute([':dept' => $row['dept_id'], ':year' => $row['year'], ':semester' => $row['semester'], ':section' => $row['section']]);
            $totalStudents = (int)($totalStmt->fetch()['c'] ?? 0);
            $row['present_count'] = $presentCount;
            $row['absent_count'] = max(0, $totalStudents - $presentCount);
            $row['total_students'] = $totalStudents;
            unset($row['dept_id']);
        }
        unset($row);

        json_response(['success' => true, 'sessions' => $sessions]);
    }

    public function startSession(): void
    {
        Session::requireRole($this->sessionCtx, ['faculty']);
        require_method('POST');
        $input = read_json_body();
        $timetableId = isset($input['timetable_id']) ? (int)$input['timetable_id'] : 0;
        if ($timetableId <= 0) {
            json_response(['success' => false, 'error' => 'timetable_id is required'], 400);
        }

        $collegeId = $this->sessionCtx->currentUser['college_id'];
        $facultyId = $this->getFacultyId();

        $stmt = $this->pdo->prepare('SELECT t.*, cs.course_name FROM timetable t JOIN courses_sections cs ON t.course_id = cs.id WHERE t.id = :id AND t.college_id = :cid AND t.faculty_id = :fid');
        $stmt->execute([':id' => $timetableId, ':cid' => $collegeId, ':fid' => $facultyId]);
        $slot = $stmt->fetch();
        if (!$slot) {
            json_response(['success' => false, 'error' => 'Invalid timetable slot'], 400);
        }

        $dow = (int)date('N');
        $nowTime = time();
        $startTime = strtotime((string)$slot['start_time']);
        $endTime = strtotime((string)$slot['end_time']);
        $buffer = 600; // 10 minutes buffer

        if ((int)$slot['day_of_week'] !== $dow || $nowTime < ($startTime - $buffer) || $nowTime > ($endTime + $buffer)) {
            json_response(['success' => false, 'error' => 'This class is not in a live timetable slot right now. OTP can be generated only during scheduled class time (with 10 min buffer).'], 400);
        }

        $otp = random_int(100000, 999999);
        $now = new DateTime();
        $expiry = (clone $now)->modify('+10 minutes');

        $stmt = $this->pdo->prepare('INSERT INTO attendance_sessions (college_id, faculty_id, course_id, subject, otp_code, otp_expiry, start_time, status) VALUES (:cid, :fid, :course_id, :subject, :otp, :otp_expiry, :start_time, :status)');
        $stmt->execute([':cid' => $collegeId, ':fid' => $facultyId, ':course_id' => $slot['course_id'], ':subject' => $slot['subject'], ':otp' => $otp, ':otp_expiry' => $expiry->format('Y-m-d H:i:s'), ':start_time' => $now->format('Y-m-d H:i:s'), ':status' => 'active']);
        $sessionId = (int)$this->pdo->lastInsertId();

        $this->audit->log($facultyId, 'attendance_session_started', ['session_id' => $sessionId]);
        json_response(['success' => true, 'session_id' => $sessionId, 'otp' => $otp]);
    }

    public function startSessionQuick(): void
    {
        Session::requireRole($this->sessionCtx, ['faculty']);
        require_method('POST');
        $input = read_json_body();
        $courseId = isset($input['course_id']) ? (int)$input['course_id'] : 0;
        $subject = trim((string)($input['subject'] ?? ''));
        $isExtraClass = !empty($input['extra_class']);
        $extraReason = trim((string)($input['extra_reason'] ?? ''));
        if ($isExtraClass && $extraReason === '') {
            json_response(['success' => false, 'error' => 'Extra class reason is required'], 400);
        }
        if (!$isExtraClass) {
            $extraReason = '';
        }
        else {
            $extraReason = substr($extraReason, 0, 255);
        }
        if ($courseId <= 0) {
            json_response(['success' => false, 'error' => 'course_id is required'], 400);
        }

        $collegeId = $this->sessionCtx->currentUser['college_id'];
        $facultyUserId = $this->sessionCtx->currentUser['id'];
        $facultyId = $this->getFacultyId();

        $stmt = $this->pdo->prepare('SELECT cs.id, cs.course_name, cs.year, cs.semester, cs.section FROM timetable t JOIN courses_sections cs ON cs.id = t.course_id WHERE cs.id = ? AND t.college_id = ? AND t.faculty_id = ? GROUP BY cs.id, cs.course_name, cs.year, cs.semester, cs.section LIMIT 1');
        $stmt->execute([$courseId, $collegeId, $facultyId]);
        $course = $stmt->fetch();
        if (!$course) {
            json_response(['success' => false, 'error' => 'Invalid class selected'], 400);
        }

        if ($subject === '') {
            $subject = $course['course_name'];
        }

        $matchedSlot = null;
        if (!$isExtraClass) {
            $dow = (int)date('N');
            $nowTime = date('H:i:s');
            // Check with 10 min buffer
            $slotCheck = $this->pdo->prepare('SELECT t.id, t.start_time, t.end_time, t.day_of_week, t.subject FROM timetable t WHERE t.college_id = ? AND t.faculty_id = ? AND t.course_id = ? AND t.day_of_week = ? AND (TIME_TO_SEC(?) >= (TIME_TO_SEC(t.start_time) - 600)) AND (TIME_TO_SEC(?) <= (TIME_TO_SEC(t.end_time) + 600)) LIMIT 1');
            $slotCheck->execute([$collegeId, $facultyId, $course['id'], $dow, $nowTime, $nowTime]);
            $matchedSlot = $slotCheck->fetch();
            if (!$matchedSlot) {
                json_response(['success' => false, 'error' => 'This class is not in a live timetable slot right now. OTP can be generated only during scheduled class time (with 10 min buffer).'], 400);
            }
            $slotSubject = trim((string)($matchedSlot['subject'] ?? ''));
            if ($slotSubject !== '') {
                $subject = $slotSubject;
            }
        }
        elseif ($subject === '') {
            $subStmt = $this->pdo->prepare('SELECT t.subject FROM timetable t WHERE t.college_id = ? AND t.faculty_id = ? AND t.course_id = ? AND t.subject IS NOT NULL AND TRIM(t.subject) <> "" ORDER BY t.day_of_week, t.start_time LIMIT 1');
            $subStmt->execute([$collegeId, $facultyId, $course['id']]);
            $subRow = $subStmt->fetch();
            if ($subRow && trim((string)$subRow['subject']) !== '') {
                $subject = trim((string)$subRow['subject']);
            }
        }

        $this->pdo->prepare("UPDATE attendance_sessions SET status = 'closed', end_time = NOW() WHERE faculty_id = ? AND status = 'active'")->execute([$facultyId]);

        $otp = random_int(100000, 999999);
        $now = new DateTime();
        $expiry = (clone $now)->modify('+10 minutes');

        $this->pdo->prepare('INSERT INTO attendance_sessions (college_id, faculty_id, course_id, subject, extra_reason, otp_code, otp_expiry, start_time, end_time, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
            ->execute([$collegeId, $facultyId, $course['id'], $subject, ($extraReason !== '' ? $extraReason : null), (string)$otp, $expiry->format('Y-m-d H:i:s'), $now->format('Y-m-d H:i:s'), null, 'active']);
        $sessionId = (int)$this->pdo->lastInsertId();

        $this->audit->log($facultyUserId, 'attendance_session_started', ['session_id' => $sessionId, 'source' => $isExtraClass ? 'quick_extra' : 'quick', 'extra_reason' => ($extraReason !== '' ? $extraReason : null)]);
        json_response([
            'success' => true,
            'session' => [
                'id' => $sessionId, 'subject' => $subject, 'otp_code' => (string)$otp,
                'otp_expiry' => $expiry->format('Y-m-d H:i:s'), 'start_time' => $now->format('Y-m-d H:i:s'),
                'course_name' => $course['course_name'], 'year' => $course['year'], 'semester' => $course['semester'],
                'section' => $course['section'], 'is_extra_class' => $isExtraClass,
                'extra_reason' => ($extraReason !== '' ? $extraReason : null),
                'slot_start_time' => $matchedSlot['start_time'] ?? null, 'slot_end_time' => $matchedSlot['end_time'] ?? null,
            ],
        ]);
    }

    public function endSession(): void
    {
        Session::requireRole($this->sessionCtx, ['faculty']);
        require_method('POST');
        $input = read_json_body();
        $sessionId = isset($input['session_id']) ? (int)$input['session_id'] : 0;
        if ($sessionId <= 0) {
            json_response(['success' => false, 'error' => 'session_id is required'], 400);
        }

        $facultyId = $this->getFacultyId();
        $stmt = $this->pdo->prepare("UPDATE attendance_sessions SET status = 'closed', end_time = NOW() WHERE id = :id AND faculty_id = :fid");
        $stmt->execute([':id' => $sessionId, ':fid' => $facultyId]);
        if ($stmt->rowCount() === 0) {
            json_response(['success' => false, 'error' => 'Session not found'], 404);
        }
        $this->audit->log($facultyId, 'attendance_session_closed', ['session_id' => $sessionId]);
        json_response(['success' => true]);
    }

    public function sessionResults(): void
    {
        Session::requireRole($this->sessionCtx, ['faculty']);
        $sessionId = isset($_GET['session_id']) ? (int)$_GET['session_id'] : 0;
        if ($sessionId <= 0) {
            json_response(['success' => false, 'error' => 'session_id is required'], 400);
        }

        $facultyId = $this->getFacultyId();
        $ownerCheck = $this->pdo->prepare('SELECT id FROM attendance_sessions WHERE id = :sid AND faculty_id = :fid LIMIT 1');
        $ownerCheck->execute([':sid' => $sessionId, ':fid' => $facultyId]);
        if (!$ownerCheck->fetch()) {
            json_response(['success' => false, 'error' => 'Session not found'], 404);
        }

        $stmt = $this->pdo->prepare(
            'SELECT ar.id, ar.timestamp, ar.match_score, ar.status, s.student_id, s.year, s.section, u.unique_user_id, u.name
             FROM attendance_records ar
             JOIN students s ON ar.student_id = s.student_id
             JOIN users u ON s.user_id = u.id
             WHERE ar.session_id = :sid
             ORDER BY ar.timestamp'
        );
        $stmt->execute([':sid' => $sessionId]);
        json_response(['success' => true, 'records' => $stmt->fetchAll()]);
    }
}