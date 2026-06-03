<?php

class TimetableController
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

    public function list(): void
    {
        Session::requireRole($this->sessionCtx, ['college_admin']);
        $collegeId = (int)$this->sessionCtx->currentUser['college_id'];
        $deptId = isset($_GET['dept_id']) ? (int)$_GET['dept_id'] : 0;
        $year = isset($_GET['year']) ? (int)$_GET['year'] : 0;
        $semester = isset($_GET['semester']) ? (int)$_GET['semester'] : 0;
        $section = trim((string)($_GET['section'] ?? ''));

        $where = ['t.college_id = :cid'];
        $params = [':cid' => $collegeId];
        if ($deptId > 0) { $where[] = 'cs.dept_id = :dept_id'; $params[':dept_id'] = $deptId; }
        if ($year > 0) { $where[] = 'cs.year = :year'; $params[':year'] = $year; }
        if ($semester > 0) { $where[] = 'cs.semester = :semester'; $params[':semester'] = $semester; }
        if ($section !== '') { $where[] = 'cs.section = :section'; $params[':section'] = $section; }

        $stmt = $this->pdo->prepare(
            'SELECT t.id, t.day_of_week, t.start_time, t.end_time, t.subject,
                    cs.course_name, cs.year, cs.semester, cs.section, cs.dept_id, d.name AS dept_name,
                    u.unique_user_id AS faculty_unique_id, u.name AS faculty_name
             FROM timetable t
             JOIN courses_sections cs ON cs.id = t.course_id
             JOIN departments d ON d.id = cs.dept_id
             JOIN faculty f ON f.faculty_id = t.faculty_id
             JOIN users u ON u.id = f.user_id
             WHERE ' . implode(' AND ', $where) . '
             ORDER BY d.name ASC, cs.year ASC, cs.semester ASC, cs.section ASC, t.day_of_week ASC, t.start_time ASC'
        );
        $stmt->execute($params);
        json_response(['success' => true, 'rows' => $stmt->fetchAll()]);
    }

    public function createManual(): void
    {
        Session::requireRole($this->sessionCtx, ['college_admin']);
        require_method('POST');
        $collegeId = (int)$this->sessionCtx->currentUser['college_id'];
        $payload = $this->normalizeTimetablePayload(read_json_body());

        $this->pdo->beginTransaction();
        try {
            $saved = $this->persistTimetableRow($collegeId, $payload, null, true);
            $this->pdo->commit();
        } catch (Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        $this->audit->log($this->sessionCtx->currentUser['id'], 'timetable_row_created', [
            'subject' => $payload['subject'],
            'timetable_id' => $saved['id'],
        ]);
        json_response(['success' => true, 'timetable_id' => $saved['id']]);
    }

    public function updateManual(): void
    {
        Session::requireRole($this->sessionCtx, ['college_admin']);
        require_method('POST');
        $input = read_json_body();
        $collegeId = (int)$this->sessionCtx->currentUser['college_id'];
        $timetableId = isset($input['timetable_id']) ? (int)$input['timetable_id'] : 0;
        if ($timetableId <= 0) { json_response(['success' => false, 'error' => 'timetable_id is required'], 400); }
        $payload = $this->normalizeTimetablePayload($input);

        $stmt = $this->pdo->prepare('SELECT id FROM timetable WHERE id = :id AND college_id = :cid LIMIT 1');
        $stmt->execute([':id' => $timetableId, ':cid' => $collegeId]);
        if (!$stmt->fetch()) { json_response(['success' => false, 'error' => 'Timetable row not found'], 404); }

        $this->pdo->beginTransaction();
        try {
            $saved = $this->persistTimetableRow($collegeId, $payload, $timetableId, true);
            $this->pdo->commit();
        } catch (Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        $this->audit->log($this->sessionCtx->currentUser['id'], 'timetable_row_updated', [
            'timetable_id' => $saved['id'],
            'subject' => $payload['subject'],
        ]);
        json_response(['success' => true, 'timetable_id' => $saved['id']]);
    }

    public function bulkImport(): void
    {
        Session::requireRole($this->sessionCtx, ['college_admin']);
        require_method('POST');
        $input = read_json_body();
        $rowsInput = $input['rows'] ?? null;
        $replaceExistingClasses = !array_key_exists('replace_existing_classes', $input) || (bool)$input['replace_existing_classes'];
        $collegeId = (int)$this->sessionCtx->currentUser['college_id'];

        if (!is_array($rowsInput) || !$rowsInput) {
            json_response(['success' => false, 'error' => 'rows array is required'], 400);
        }

        $normalizedRows = [];
        $rowErrors = [];
        foreach ($rowsInput as $index => $row) {
            $rowNumber = is_array($row) && isset($row['row_number']) ? (int)$row['row_number'] : ($index + 2);
            if (!is_array($row)) {
                $rowErrors[] = ['row' => $rowNumber, 'error' => sprintf('Row %d: invalid CSV row payload', $rowNumber)];
                continue;
            }
            try {
                $normalizedRows[] = $this->normalizeTimetablePayload($row, $rowNumber);
            } catch (Throwable $e) {
                $rowErrors[] = ['row' => $rowNumber, 'error' => $e->getMessage()];
            }
        }

        if ($rowErrors) {
            json_response([
                'success' => false,
                'error' => 'Some timetable rows are invalid. Fix the CSV and upload again.',
                'row_errors' => $rowErrors,
            ], 400);
        }

        $this->pdo->beginTransaction();
        try {
            $dedupedRows = [];
            foreach ($normalizedRows as $row) {
                $resolved = $this->resolveTimetableRowReferences($collegeId, $row);
                $dedupeKey = implode('|', [
                    $resolved['course_id'],
                    $resolved['day_of_week'],
                    $resolved['start_time'],
                    $resolved['end_time'],
                ]);
                $dedupedRows[$dedupeKey] = $resolved;
            }

            $keepIdsByCourse = [];
            $insertedCount = 0;
            $updatedCount = 0;
            foreach ($dedupedRows as $row) {
                $existingId = $this->findExistingSlotId(
                    $collegeId,
                    (int)$row['course_id'],
                    (int)$row['day_of_week'],
                    (string)$row['start_time'],
                    (string)$row['end_time']
                );

                if ($existingId > 0) {
                    $this->updateTimetableRecord($collegeId, $existingId, $row);
                    $savedId = $existingId;
                    $updatedCount++;
                } else {
                    $savedId = $this->insertTimetableRecord($collegeId, $row);
                    $insertedCount++;
                }

                if (!isset($keepIdsByCourse[$row['course_id']])) {
                    $keepIdsByCourse[$row['course_id']] = [];
                }
                $keepIdsByCourse[$row['course_id']][] = $savedId;
            }

            $deletedCount = 0;
            if ($replaceExistingClasses) {
                foreach ($keepIdsByCourse as $courseId => $keepIds) {
                    $deletedCount += $this->deleteMissingCourseSlots($collegeId, (int)$courseId, $keepIds);
                }
            }

            $this->pdo->commit();
        } catch (Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        $classesUpdated = count($keepIdsByCourse);
        $duplicatesCollapsed = max(0, count($normalizedRows) - count($dedupedRows));
        $this->audit->log($this->sessionCtx->currentUser['id'], 'timetable_bulk_import', [
            'rows_received' => count($rowsInput),
            'rows_processed' => count($dedupedRows),
            'classes_updated' => $classesUpdated,
            'replace_existing_classes' => $replaceExistingClasses,
        ]);

        json_response([
            'success' => true,
            'inserted_count' => $insertedCount,
            'updated_count' => $updatedCount,
            'deleted_count' => $deletedCount,
            'rows_processed' => count($dedupedRows),
            'rows_received' => count($rowsInput),
            'classes_updated' => $classesUpdated,
            'duplicates_collapsed' => $duplicatesCollapsed,
        ]);
    }

    public function delete(): void
    {
        Session::requireRole($this->sessionCtx, ['college_admin']);
        require_method('POST');
        $input = read_json_body();
        $collegeId = (int)$this->sessionCtx->currentUser['college_id'];
        $timetableId = isset($input['timetable_id']) ? (int)$input['timetable_id'] : 0;
        if ($timetableId <= 0) { json_response(['success' => false, 'error' => 'timetable_id is required'], 400); }

        $stmt = $this->pdo->prepare('DELETE FROM timetable WHERE id = :id AND college_id = :cid');
        $stmt->execute([':id' => $timetableId, ':cid' => $collegeId]);
        if ($stmt->rowCount() === 0) { json_response(['success' => false, 'error' => 'Timetable row not found'], 404); }

        $this->audit->log($this->sessionCtx->currentUser['id'], 'timetable_row_deleted', ['timetable_id' => $timetableId]);
        json_response(['success' => true]);
    }

    private function normalizeTimetablePayload(array $input, int $rowNumber = 0): array
    {
        $deptName = trim((string)($input['dept_name'] ?? $input['department'] ?? $input['dept'] ?? ''));
        $courseName = trim((string)($input['course_name'] ?? $input['course'] ?? ''));
        $year = (int)($input['year'] ?? 0);
        $section = strtoupper(trim((string)($input['section'] ?? 'A')));
        $facultyUniqueId = trim((string)($input['faculty_unique_id'] ?? $input['faculty_uid'] ?? $input['faculty_id'] ?? $input['faculty_code'] ?? ''));
        $semester = $this->normalizeSemester($year, $input['semester'] ?? $input['sem'] ?? null);
        $dayOfWeek = $this->normalizeDayOfWeek($input['day_of_week'] ?? $input['day'] ?? '', $rowNumber);
        $startTime = $this->normalizeTimeValue($input['start_time'] ?? $input['start'] ?? '', 'start_time', $rowNumber);
        $endTime = $this->normalizeTimeValue($input['end_time'] ?? $input['end'] ?? '', 'end_time', $rowNumber);
        $subject = trim((string)($input['subject'] ?? $input['subject_name'] ?? $courseName));

        if ($deptName === '') { throw $this->rowError($rowNumber, 'department is required'); }
        if ($courseName === '') { throw $this->rowError($rowNumber, 'course_name is required'); }
        if ($year <= 0) { throw $this->rowError($rowNumber, 'year must be a positive number'); }
        if ($section === '') { throw $this->rowError($rowNumber, 'section is required'); }
        if ($facultyUniqueId === '') { throw $this->rowError($rowNumber, 'faculty_unique_id is required'); }
        if ($subject === '') { $subject = $courseName; }
        if ($startTime >= $endTime) {
            throw $this->rowError($rowNumber, 'start_time must be earlier than end_time');
        }

        return [
            'dept_name' => $deptName,
            'course_name' => $courseName,
            'year' => $year,
            'semester' => $semester,
            'section' => $section,
            'faculty_unique_id' => $facultyUniqueId,
            'day_of_week' => $dayOfWeek,
            'start_time' => $startTime,
            'end_time' => $endTime,
            'subject' => $subject,
            'row_number' => $rowNumber,
        ];
    }

    private function normalizeSemester(int $year, mixed $rawSemester): int
    {
        $semester = (int)$rawSemester;
        if ($semester <= 0) {
            $semester = max(1, ($year * 2) - 1);
        }
        return max(1, min(8, $semester));
    }

    private function normalizeDayOfWeek(mixed $rawDay, int $rowNumber = 0): int
    {
        if (is_numeric($rawDay)) {
            $day = (int)$rawDay;
            if ($day >= 1 && $day <= 7) {
                return $day;
            }
        }

        $text = strtolower(trim((string)$rawDay));
        $map = [
            'mon' => 1, 'monday' => 1,
            'tue' => 2, 'tues' => 2, 'tuesday' => 2,
            'wed' => 3, 'wednesday' => 3,
            'thu' => 4, 'thur' => 4, 'thurs' => 4, 'thursday' => 4,
            'fri' => 5, 'friday' => 5,
            'sat' => 6, 'saturday' => 6,
            'sun' => 7, 'sunday' => 7,
        ];
        if (isset($map[$text])) {
            return $map[$text];
        }

        throw $this->rowError($rowNumber, 'day_of_week must be 1-7 or Monday-Sunday');
    }

    private function normalizeTimeValue(mixed $rawTime, string $fieldName, int $rowNumber = 0): string
    {
        $text = trim((string)$rawTime);
        if ($text === '') {
            throw $this->rowError($rowNumber, sprintf('%s is required', $fieldName));
        }

        if (preg_match('/^\d{1,2}:\d{2}$/', $text)) {
            $text .= ':00';
        }

        if (!preg_match('/^\d{1,2}:\d{2}:\d{2}$/', $text)) {
            $parsed = strtotime($text);
            if ($parsed === false) {
                throw $this->rowError($rowNumber, sprintf('%s must be in HH:MM or HH:MM:SS format', $fieldName));
            }
            $text = date('H:i:s', $parsed);
        }

        [$hours, $minutes, $seconds] = array_map('intval', explode(':', $text));
        if ($hours < 0 || $hours > 23 || $minutes < 0 || $minutes > 59 || $seconds < 0 || $seconds > 59) {
            throw $this->rowError($rowNumber, sprintf('%s contains an invalid time', $fieldName));
        }

        return sprintf('%02d:%02d:%02d', $hours, $minutes, $seconds);
    }

    private function rowError(int $rowNumber, string $message): RuntimeException
    {
        if ($rowNumber > 0) {
            return new RuntimeException(sprintf('Row %d: %s', $rowNumber, $message));
        }
        return new RuntimeException($message);
    }

    private function resolveTimetableRowReferences(int $collegeId, array $payload): array
    {
        $this->pdo->prepare('INSERT INTO departments (college_id, name, status) VALUES (:cid, :name, "active") ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), status = "active"')
            ->execute([':cid' => $collegeId, ':name' => $payload['dept_name']]);
        $deptId = (int)$this->pdo->lastInsertId();

        $this->pdo->prepare('INSERT INTO courses_sections (dept_id, course_name, year, semester, section) VALUES (:dept, :course, :year, :semester, :section) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)')
            ->execute([
                ':dept' => $deptId,
                ':course' => $payload['course_name'],
                ':year' => $payload['year'],
                ':semester' => $payload['semester'],
                ':section' => $payload['section'],
            ]);
        $courseId = (int)$this->pdo->lastInsertId();

        $stmt = $this->pdo->prepare('SELECT f.faculty_id, f.dept_id, u.name FROM faculty f JOIN users u ON u.id = f.user_id WHERE u.unique_user_id = :uid AND u.college_id = :cid LIMIT 1');
        $stmt->execute([':uid' => $payload['faculty_unique_id'], ':cid' => $collegeId]);
        $faculty = $stmt->fetch();
        if (!$faculty) {
            throw $this->rowError((int)($payload['row_number'] ?? 0), sprintf('faculty "%s" not found for this college', $payload['faculty_unique_id']));
        }
        if ((int)($faculty['dept_id'] ?? 0) !== $deptId) {
            throw $this->rowError(
                (int)($payload['row_number'] ?? 0),
                sprintf('faculty "%s" is not assigned to department "%s"', $payload['faculty_unique_id'], $payload['dept_name'])
            );
        }

        $payload['dept_id'] = $deptId;
        $payload['course_id'] = $courseId;
        $payload['faculty_id'] = (int)$faculty['faculty_id'];
        return $payload;
    }

    private function persistTimetableRow(int $collegeId, array $payload, ?int $timetableId = null, bool $replaceBySlot = false): array
    {
        $resolved = $this->resolveTimetableRowReferences($collegeId, $payload);
        $saveId = $timetableId !== null ? max(0, $timetableId) : 0;

        if ($saveId > 0) {
            $conflictId = $this->findExistingSlotId(
                $collegeId,
                (int)$resolved['course_id'],
                (int)$resolved['day_of_week'],
                (string)$resolved['start_time'],
                (string)$resolved['end_time'],
                $saveId
            );
            if ($replaceBySlot && $conflictId > 0) {
                $this->updateTimetableRecord($collegeId, $conflictId, $resolved);
                $this->pdo->prepare('DELETE FROM timetable WHERE id = :id AND college_id = :cid')
                    ->execute([':id' => $saveId, ':cid' => $collegeId]);
                return ['id' => $conflictId];
            }

            $this->updateTimetableRecord($collegeId, $saveId, $resolved);
            return ['id' => $saveId];
        }

        if ($replaceBySlot) {
            $existingId = $this->findExistingSlotId(
                $collegeId,
                (int)$resolved['course_id'],
                (int)$resolved['day_of_week'],
                (string)$resolved['start_time'],
                (string)$resolved['end_time']
            );
            if ($existingId > 0) {
                $this->updateTimetableRecord($collegeId, $existingId, $resolved);
                return ['id' => $existingId];
            }
        }

        return ['id' => $this->insertTimetableRecord($collegeId, $resolved)];
    }

    private function findExistingSlotId(
        int $collegeId,
        int $courseId,
        int $dayOfWeek,
        string $startTime,
        string $endTime,
        int $excludeId = 0
    ): int {
        $sql = 'SELECT id FROM timetable WHERE college_id = :cid AND course_id = :course_id AND day_of_week = :dow AND start_time = :start_time AND end_time = :end_time';
        $params = [
            ':cid' => $collegeId,
            ':course_id' => $courseId,
            ':dow' => $dayOfWeek,
            ':start_time' => $startTime,
            ':end_time' => $endTime,
        ];
        if ($excludeId > 0) {
            $sql .= ' AND id <> :exclude_id';
            $params[':exclude_id'] = $excludeId;
        }
        $sql .= ' ORDER BY id ASC LIMIT 1';

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        $row = $stmt->fetch();
        return $row ? (int)$row['id'] : 0;
    }

    private function insertTimetableRecord(int $collegeId, array $row): int
    {
        $this->pdo->prepare('INSERT INTO timetable (college_id, course_id, faculty_id, day_of_week, start_time, end_time, subject) VALUES (:cid, :course_id, :faculty_id, :dow, :start_time, :end_time, :subject)')
            ->execute([
                ':cid' => $collegeId,
                ':course_id' => $row['course_id'],
                ':faculty_id' => $row['faculty_id'],
                ':dow' => $row['day_of_week'],
                ':start_time' => $row['start_time'],
                ':end_time' => $row['end_time'],
                ':subject' => $row['subject'],
            ]);
        return (int)$this->pdo->lastInsertId();
    }

    private function updateTimetableRecord(int $collegeId, int $timetableId, array $row): void
    {
        $this->pdo->prepare('UPDATE timetable SET course_id = :course_id, faculty_id = :faculty_id, day_of_week = :dow, start_time = :start_time, end_time = :end_time, subject = :subject WHERE id = :id AND college_id = :cid')
            ->execute([
                ':course_id' => $row['course_id'],
                ':faculty_id' => $row['faculty_id'],
                ':dow' => $row['day_of_week'],
                ':start_time' => $row['start_time'],
                ':end_time' => $row['end_time'],
                ':subject' => $row['subject'],
                ':id' => $timetableId,
                ':cid' => $collegeId,
            ]);
    }

    private function deleteMissingCourseSlots(int $collegeId, int $courseId, array $keepIds): int
    {
        $keepIds = array_values(array_unique(array_map('intval', $keepIds)));
        if (!$keepIds) {
            $stmt = $this->pdo->prepare('DELETE FROM timetable WHERE college_id = :cid AND course_id = :course_id');
            $stmt->execute([':cid' => $collegeId, ':course_id' => $courseId]);
            return $stmt->rowCount();
        }

        $placeholders = [];
        $params = [':cid' => $collegeId, ':course_id' => $courseId];
        foreach ($keepIds as $index => $keepId) {
            $key = ':keep_' . $index;
            $placeholders[] = $key;
            $params[$key] = $keepId;
        }

        $stmt = $this->pdo->prepare(
            'DELETE FROM timetable WHERE college_id = :cid AND course_id = :course_id AND id NOT IN (' . implode(', ', $placeholders) . ')'
        );
        $stmt->execute($params);
        return $stmt->rowCount();
    }
}
