<?php

class AcademicController
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

    public function departmentsList(): void
    {
        Session::requireRole($this->sessionCtx, ['college_admin']);
        $collegeId = require_college_id($this->sessionCtx->currentUser);
        $includeInactive = !empty($_GET['include_inactive']);
        $sql = 'SELECT id, name, status FROM departments WHERE college_id = :cid';
        if (!$includeInactive) { $sql .= " AND status = 'active'"; }
        $sql .= ' ORDER BY name';
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute([':cid' => $collegeId]);
        json_response(['success' => true, 'departments' => $stmt->fetchAll()]);
    }

    public function departmentsSave(): void
    {
        Session::requireRole($this->sessionCtx, ['college_admin']);
        require_method('POST');
        $collegeId = require_college_id($this->sessionCtx->currentUser);
        $input = read_json_body();
        $id = isset($input['id']) ? (int)$input['id'] : null;
        $name = trim($input['name'] ?? '');
        if ($name === '') { json_response(['success' => false, 'error' => 'Name is required'], 400); }

        if ($id) {
            $dupStmt = $this->pdo->prepare('SELECT id FROM departments WHERE college_id = :cid AND name = :name AND id <> :id LIMIT 1');
            $dupStmt->execute([':cid' => $collegeId, ':name' => $name, ':id' => $id]);
            if ($dupStmt->fetch()) { json_response(['success' => false, 'error' => 'Department name already exists'], 400); }
            $stmt = $this->pdo->prepare("UPDATE departments SET name = :name, status = 'active' WHERE id = :id AND college_id = :cid");
            $stmt->execute([':name' => $name, ':id' => $id, ':cid' => $collegeId]);
            $this->audit->log($this->sessionCtx->currentUser['id'], 'department_updated', ['id' => $id]);
        } else {
            $stmt = $this->pdo->prepare("INSERT INTO departments (college_id, name, status) VALUES (:cid, :name, 'active') ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), status = 'active', name = VALUES(name)");
            $stmt->execute([':cid' => $collegeId, ':name' => $name]);
            $id = (int)$this->pdo->lastInsertId();
            $this->audit->log($this->sessionCtx->currentUser['id'], 'department_created', ['id' => $id]);
        }
        json_response(['success' => true, 'id' => $id]);
    }

    public function departmentsDelete(): void
    {
        Session::requireRole($this->sessionCtx, ['college_admin']);
        require_method('POST');
        $collegeId = require_college_id($this->sessionCtx->currentUser);
        $input = read_json_body();
        $id = isset($input['id']) ? (int)$input['id'] : 0;
        if ($id <= 0) { json_response(['success' => false, 'error' => 'id is required'], 400); }

        $stmt = $this->pdo->prepare('SELECT id, name FROM departments WHERE id = :id AND college_id = :cid LIMIT 1');
        $stmt->execute([':id' => $id, ':cid' => $collegeId]);
        $dept = $stmt->fetch();
        if (!$dept) { json_response(['success' => false, 'error' => 'Department not found'], 404); }

        $s = $this->pdo->prepare('SELECT COUNT(*) AS c FROM courses_sections WHERE dept_id = :dept');
        $s->execute([':dept' => $id]);
        $courseCount = (int)($s->fetch()['c'] ?? 0);

        $s = $this->pdo->prepare('SELECT COUNT(*) AS c FROM attendance_sessions s JOIN courses_sections cs ON cs.id = s.course_id WHERE cs.dept_id = :dept');
        $s->execute([':dept' => $id]); $sessionCount = (int)($s->fetch()['c'] ?? 0);

        $s = $this->pdo->prepare('SELECT COUNT(*) AS c FROM faculty WHERE dept_id = :dept');
        $s->execute([':dept' => $id]); $facultyCount = (int)($s->fetch()['c'] ?? 0);

        $s = $this->pdo->prepare('SELECT COUNT(*) AS c FROM students WHERE dept_id = :dept');
        $s->execute([':dept' => $id]); $studentCount = (int)($s->fetch()['c'] ?? 0);

        if ($courseCount > 0 || $sessionCount > 0 || $facultyCount > 0 || $studentCount > 0) {
            $this->pdo->prepare("UPDATE departments SET status = 'inactive' WHERE id = :id AND college_id = :cid")
                ->execute([':id' => $id, ':cid' => $collegeId]);
            $this->audit->log($this->sessionCtx->currentUser['id'], 'department_archived', ['id' => $id, 'name' => $dept['name'] ?? null]);
            json_response(['success' => true, 'archived' => true, 'message' => 'Department archived because attendance history exists for this department classes.']);
        }

        $stmt = $this->pdo->prepare('DELETE FROM departments WHERE id = :id AND college_id = :cid');
        $stmt->execute([':id' => $id, ':cid' => $collegeId]);
        if ($stmt->rowCount() === 0) { json_response(['success' => false, 'error' => 'Department not found'], 404); }
        $this->audit->log($this->sessionCtx->currentUser['id'], 'department_deleted', ['id' => $id, 'name' => $dept['name'] ?? null]);
        json_response(['success' => true]);
    }

    public function coursesList(): void
    {
        Session::requireRole($this->sessionCtx, ['college_admin']);
        $collegeId = require_college_id($this->sessionCtx->currentUser);
        $deptId = isset($_GET['dept_id']) ? (int)$_GET['dept_id'] : 0;
        if ($deptId <= 0) { json_response(['success' => false, 'error' => 'dept_id is required'], 400); }

        $stmt = $this->pdo->prepare("SELECT id FROM departments WHERE id = :id AND college_id = :cid AND status = 'active' LIMIT 1");
        $stmt->execute([':id' => $deptId, ':cid' => $collegeId]);
        if (!$stmt->fetch()) { json_response(['success' => false, 'error' => 'Department not found'], 404); }

        $stmt = $this->pdo->prepare('SELECT id, course_name, year, semester, section FROM courses_sections WHERE dept_id = :dept ORDER BY year, semester, section, course_name');
        $stmt->execute([':dept' => $deptId]);
        json_response(['success' => true, 'courses' => $stmt->fetchAll()]);
    }

    public function coursesSave(): void
    {
        Session::requireRole($this->sessionCtx, ['college_admin']);
        require_method('POST');
        $collegeId = require_college_id($this->sessionCtx->currentUser);
        $input = read_json_body();
        $id = isset($input['id']) ? (int)$input['id'] : null;
        $deptId = isset($input['dept_id']) ? (int)$input['dept_id'] : 0;
        $courseName = trim((string)($input['course_name'] ?? ''));
        $year = max(1, (int)($input['year'] ?? 1));
        $semester = max(1, min(8, (int)($input['semester'] ?? (($year * 2) - 1))));
        $section = trim((string)($input['section'] ?? 'A'));
        if ($deptId <= 0 || $courseName === '' || $section === '') {
            json_response(['success' => false, 'error' => 'dept_id, course_name and section are required'], 400);
        }

        $stmt = $this->pdo->prepare("SELECT id FROM departments WHERE id = :id AND college_id = :cid AND status = 'active' LIMIT 1");
        $stmt->execute([':id' => $deptId, ':cid' => $collegeId]);
        if (!$stmt->fetch()) { json_response(['success' => false, 'error' => 'Department not found'], 404); }

        if ($id) {
            $stmt = $this->pdo->prepare('UPDATE courses_sections SET course_name = :name, year = :year, semester = :semester, section = :section WHERE id = :id AND dept_id = :dept');
            $stmt->execute([':name' => $courseName, ':year' => $year, ':semester' => $semester, ':section' => $section, ':id' => $id, ':dept' => $deptId]);
            $this->audit->log($this->sessionCtx->currentUser['id'], 'course_updated', ['id' => $id]);
        } else {
            $stmt = $this->pdo->prepare('INSERT INTO courses_sections (dept_id, course_name, year, semester, section) VALUES (:dept, :name, :year, :semester, :section)');
            $stmt->execute([':dept' => $deptId, ':name' => $courseName, ':year' => $year, ':semester' => $semester, ':section' => $section]);
            $id = (int)$this->pdo->lastInsertId();
            $this->audit->log($this->sessionCtx->currentUser['id'], 'course_created', ['id' => $id]);
        }
        json_response(['success' => true, 'id' => $id]);
    }

    public function coursesDelete(): void
    {
        Session::requireRole($this->sessionCtx, ['college_admin']);
        require_method('POST');
        $collegeId = require_college_id($this->sessionCtx->currentUser);
        $input = read_json_body();
        $id = isset($input['id']) ? (int)$input['id'] : 0;
        if ($id <= 0) { json_response(['success' => false, 'error' => 'id is required'], 400); }

        $stmt = $this->pdo->prepare('SELECT cs.id, cs.dept_id, cs.course_name, cs.year, cs.semester, cs.section FROM courses_sections cs JOIN departments d ON d.id = cs.dept_id WHERE cs.id = :id AND d.college_id = :cid LIMIT 1');
        $stmt->execute([':id' => $id, ':cid' => $collegeId]);
        $course = $stmt->fetch();
        if (!$course) { json_response(['success' => false, 'error' => 'Course not found'], 404); }

        $s = $this->pdo->prepare('SELECT COUNT(*) AS c FROM timetable WHERE course_id = :course_id');
        $s->execute([':course_id' => $id]);
        if ((int)($s->fetch()['c'] ?? 0) > 0) { json_response(['success' => false, 'error' => 'Course is used in timetable. Remove timetable rows first.'], 400); }

        $s = $this->pdo->prepare('SELECT COUNT(*) AS c FROM attendance_sessions WHERE course_id = :course_id');
        $s->execute([':course_id' => $id]);
        if ((int)($s->fetch()['c'] ?? 0) > 0) { json_response(['success' => false, 'error' => 'Course has attendance history, cannot delete.'], 400); }

        $s = $this->pdo->prepare('SELECT COUNT(*) AS c FROM students s WHERE s.dept_id = :dept_id AND s.course = :course_name AND s.year = :year AND s.semester = :semester AND s.section = :section');
        $s->execute([':dept_id' => (int)$course['dept_id'], ':course_name' => (string)$course['course_name'], ':year' => (int)$course['year'], ':semester' => (int)$course['semester'], ':section' => (string)$course['section']]);
        if ((int)($s->fetch()['c'] ?? 0) > 0) { json_response(['success' => false, 'error' => 'Students are mapped to this class. Reassign students first.'], 400); }

        $stmt = $this->pdo->prepare('DELETE FROM courses_sections WHERE id = :id');
        $stmt->execute([':id' => $id]);
        if ($stmt->rowCount() === 0) { json_response(['success' => false, 'error' => 'Course not found'], 404); }
        $this->audit->log($this->sessionCtx->currentUser['id'], 'course_deleted', ['id' => $id]);
        json_response(['success' => true]);
    }

    public function courseSubjectsList(): void
    {
        Session::requireRole($this->sessionCtx, ['college_admin']);
        $collegeId = require_college_id($this->sessionCtx->currentUser);
        $courseId = isset($_GET['course_id']) ? (int)$_GET['course_id'] : 0;
        if ($courseId <= 0) { json_response(['success' => false, 'error' => 'course_id is required'], 400); }

        $courseStmt = $this->pdo->prepare('SELECT cs.id, cs.course_name, cs.year, cs.semester, cs.section FROM courses_sections cs JOIN departments d ON d.id = cs.dept_id WHERE cs.id = :id AND d.college_id = :cid LIMIT 1');
        $courseStmt->execute([':id' => $courseId, ':cid' => $collegeId]);
        $course = $courseStmt->fetch();
        if (!$course) { json_response(['success' => false, 'error' => 'Course not found'], 404); }

        $stmt = $this->pdo->prepare('SELECT id, subject_name, subject_code FROM course_subjects WHERE course_id = :course_id ORDER BY subject_code, subject_name');
        $stmt->execute([':course_id' => $courseId]);
        json_response(['success' => true, 'course' => $course, 'subjects' => $stmt->fetchAll()]);
    }

    public function courseSubjectsSave(): void
    {
        Session::requireRole($this->sessionCtx, ['college_admin']);
        require_method('POST');
        $collegeId = require_college_id($this->sessionCtx->currentUser);
        $input = read_json_body();
        $id = isset($input['id']) ? (int)$input['id'] : 0;
        $courseId = isset($input['course_id']) ? (int)$input['course_id'] : 0;
        $subjectName = trim((string)($input['subject_name'] ?? ''));
        $subjectCode = strtoupper(trim((string)($input['subject_code'] ?? '')));
        if ($courseId <= 0 || $subjectName === '' || $subjectCode === '') {
            json_response(['success' => false, 'error' => 'course_id, subject_name and subject_code are required'], 400);
        }

        $courseStmt = $this->pdo->prepare('SELECT cs.id FROM courses_sections cs JOIN departments d ON d.id = cs.dept_id WHERE cs.id = :id AND d.college_id = :cid LIMIT 1');
        $courseStmt->execute([':id' => $courseId, ':cid' => $collegeId]);
        if (!$courseStmt->fetch()) { json_response(['success' => false, 'error' => 'Course not found'], 404); }

        try {
            if ($id > 0) {
                $ownStmt = $this->pdo->prepare('SELECT id FROM course_subjects WHERE id = :id AND course_id = :course_id LIMIT 1');
                $ownStmt->execute([':id' => $id, ':course_id' => $courseId]);
                if (!$ownStmt->fetch()) { json_response(['success' => false, 'error' => 'Subject not found'], 404); }
                $stmt = $this->pdo->prepare('UPDATE course_subjects SET subject_name = :subject_name, subject_code = :subject_code WHERE id = :id AND course_id = :course_id');
                $stmt->execute([':subject_name' => $subjectName, ':subject_code' => $subjectCode, ':id' => $id, ':course_id' => $courseId]);
                $this->audit->log($this->sessionCtx->currentUser['id'], 'course_subject_updated', ['id' => $id, 'course_id' => $courseId]);
            } else {
                $stmt = $this->pdo->prepare('INSERT INTO course_subjects (course_id, subject_name, subject_code) VALUES (:course_id, :subject_name, :subject_code)');
                $stmt->execute([':course_id' => $courseId, ':subject_name' => $subjectName, ':subject_code' => $subjectCode]);
                $id = (int)$this->pdo->lastInsertId();
                $this->audit->log($this->sessionCtx->currentUser['id'], 'course_subject_created', ['id' => $id, 'course_id' => $courseId]);
            }
        } catch (PDOException $e) {
            if ((string)$e->getCode() === '23000') { json_response(['success' => false, 'error' => 'Subject name or code already exists for this course'], 400); }
            throw $e;
        }
        json_response(['success' => true, 'id' => $id]);
    }

    public function courseSubjectsDelete(): void
    {
        Session::requireRole($this->sessionCtx, ['college_admin']);
        require_method('POST');
        $collegeId = require_college_id($this->sessionCtx->currentUser);
        $input = read_json_body();
        $id = isset($input['id']) ? (int)$input['id'] : 0;
        if ($id <= 0) { json_response(['success' => false, 'error' => 'id is required'], 400); }

        $stmt = $this->pdo->prepare('SELECT csu.id, csu.course_id FROM course_subjects csu JOIN courses_sections cs ON cs.id = csu.course_id JOIN departments d ON d.id = cs.dept_id WHERE csu.id = :id AND d.college_id = :cid LIMIT 1');
        $stmt->execute([':id' => $id, ':cid' => $collegeId]);
        $row = $stmt->fetch();
        if (!$row) { json_response(['success' => false, 'error' => 'Subject not found'], 404); }

        $this->pdo->prepare('DELETE FROM course_subjects WHERE id = :id')->execute([':id' => $id]);
        $this->audit->log($this->sessionCtx->currentUser['id'], 'course_subject_deleted', ['id' => $id, 'course_id' => (int)$row['course_id']]);
        json_response(['success' => true]);
    }
}
