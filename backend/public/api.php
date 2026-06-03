<?php
/**
 * AMS API Router (thin dispatcher).
 *
 * This file bootstraps shared services (PDO, session, audit, middleware),
 * runs lazy migrations, then delegates each ?action=... to the appropriate
 * controller method. All business logic lives in the controller files.
 */

require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../src/Database.php';
require_once __DIR__ . '/../src/Session.php';
require_once __DIR__ . '/../src/Middleware/ApiMiddleware.php';
require_once __DIR__ . '/../src/Services/AuthService.php';
require_once __DIR__ . '/../src/Services/AuditService.php';
require_once __DIR__ . '/../src/Services/FaceVerificationService.php';
require_once __DIR__ . '/../src/Helpers.php';

// Controllers
require_once __DIR__ . '/../src/Controllers/AuthController.php';
require_once __DIR__ . '/../src/Controllers/ProfileController.php';
require_once __DIR__ . '/../src/Controllers/CollegeController.php';
require_once __DIR__ . '/../src/Controllers/SuperAdminController.php';
require_once __DIR__ . '/../src/Controllers/CollegeAdminController.php';
require_once __DIR__ . '/../src/Controllers/AcademicController.php';
require_once __DIR__ . '/../src/Controllers/TimetableController.php';
require_once __DIR__ . '/../src/Controllers/FacultyController.php';
require_once __DIR__ . '/../src/Controllers/StudentController.php';
require_once __DIR__ . '/../src/Controllers/AttendanceController.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: ' . FRONTEND_ORIGIN);
header('Access-Control-Allow-Credentials: true');

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    exit;
}

$action = $_GET['action'] ?? '';

try {
    // ---- Core services ----
    $sessionCtx = Session::init();
    $apiMiddleware = new ApiMiddleware($sessionCtx);
    $pdo = Database::getConnection();
    ensure_base_schema_loaded($pdo);
    $audit = new AuditService();

    // ---- Lazy migrations (run once per session, not on every request) ----
    if (empty($_SESSION['_migrations_done'])) {
        try { ensure_academic_semester_columns($pdo); } catch (Throwable $e) { error_log('semester migration bootstrap skipped: ' . $e->getMessage()); }
        try { ensure_users_profile_photo_columns($pdo); } catch (Throwable $e) { error_log('users migration (profile_photo columns) skipped: ' . $e->getMessage()); }
        try { ensure_attendance_session_extra_reason_column($pdo); } catch (Throwable $e) { error_log('migration error (extra_reason): ' . $e->getMessage()); }
        try { ensure_departments_status_column($pdo); } catch (Throwable $e) { error_log('migration error (dept_status): ' . $e->getMessage()); }
        try { ensure_course_subjects_table($pdo); } catch (Throwable $e) { error_log('migration error (course_subjects): ' . $e->getMessage()); }
        try { ensure_user_profiles_table($pdo); } catch (Throwable $e) { error_log('migration error (user_profiles): ' . $e->getMessage()); }
        try { ensure_users_id_auto_increment($pdo); } catch (Throwable $e) { error_log('migration error (users_ai): ' . $e->getMessage()); }
        try { ensure_students_auto_increment($pdo); } catch (Throwable $e) { error_log('migration error (students_ai): ' . $e->getMessage()); }
        try { ensure_users_deleted_at_column($pdo); } catch (Throwable $e) { error_log('migration error (users_deleted_at): ' . $e->getMessage()); }
        try { ensure_colleges_archive_support($pdo); } catch (Throwable $e) { error_log('migration error (colleges_archive): ' . $e->getMessage()); }
        try { ensure_face_registration_updates_table($pdo); } catch (Throwable $e) { error_log('migration error (face_reg_updates): ' . $e->getMessage()); }
        try { ensure_face_verification_tables($pdo); } catch (Throwable $e) { error_log('migration error (face_verification): ' . $e->getMessage()); }
        $_SESSION['_migrations_done'] = true;
    }

    if (empty($_SESSION['_migrations_auto_increment_repair_v1'])) {
        try { ensure_auto_increment_primary_keys($pdo); } catch (Throwable $e) { error_log('migration error (repair_ai): ' . $e->getMessage()); }
        $_SESSION['_migrations_auto_increment_repair_v1'] = true;
    }


    // If a college is deactivated/removed after login, revoke session access.
    if ($action !== 'login') {
        enforce_active_college_for_session($sessionCtx, $pdo);
    }

    // ---- Instantiate controllers ----
    $auth       = new AuthController($pdo, $audit, $sessionCtx);
    $profile    = new ProfileController($pdo, $audit, $sessionCtx);
    $college    = new CollegeController($pdo, $audit, $sessionCtx->currentUser);
    $superAdmin = new SuperAdminController($pdo, $audit, $sessionCtx);
    $collegeAdmin = new CollegeAdminController($pdo, $audit, $sessionCtx);
    $academic   = new AcademicController($pdo, $audit, $sessionCtx);
    $timetable  = new TimetableController($pdo, $audit, $sessionCtx);
    $faculty    = new FacultyController($pdo, $audit, $sessionCtx);
    $student    = new StudentController($pdo, $audit, $sessionCtx);
    $attendance = new AttendanceController($pdo, $audit, $sessionCtx);

    // ---- Route ----
    switch ($action) {
        // -- Authentication --
        case 'login':                    $auth->login(); break;
        case 'logout':                   $auth->logout(); break;
        case 'me':                       $auth->me(); break;
        case 'request_password_reset':   $auth->requestPasswordReset(); break;
        case 'reset_password':           $auth->resetPassword(); break;
        case 'change_password':          $auth->changePassword(); break;

        // -- User Profile --
        case 'profile_get':              $profile->get(); break;
        case 'profile_update':           $profile->update(); break;
        case 'profile_photo_upload':     $profile->photoUpload(); break;

        // -- Super Admin --
        case 'colleges_list':
            $superAdmin->collegesList();
            break;
        case 'colleges_archive_list':
        case 'archive_list':
            $superAdmin->collegesArchiveList();
            break;
        case 'colleges_save':
            Session::requireRole($sessionCtx, ['super_admin']);
            require_method('POST');
            json_response($college->save(read_json_body()));
            break;
        case 'college_create':
        case 'superadmin_colleges_create':
            Session::requireRole($sessionCtx, ['super_admin']);
            require_method('POST');
            json_response($college->save(read_json_body()));
            break;
        case 'college_update':
        case 'superadmin_colleges_update':
            Session::requireRole($sessionCtx, ['super_admin']);
            require_method('POST');
            json_response($college->save(read_json_body()));
            break;
        case 'superadmin_colleges_delete':
            $superAdmin->superadminCollegesDelete();
            break;
        case 'colleges_remove':
            $superAdmin->collegesRemove();
            break;
        case 'colleges_restore':
        case 'archive_restore':
            $superAdmin->collegesRestore();
            break;
        case 'college_detail':
        case 'college_details':
            $superAdmin->collegeDetail();
            break;
        case 'sa_departments_list':
        case 'college_drill_departments':
            $superAdmin->saDepartmentsList();
            break;
        case 'sa_students_list':
        case 'college_drill_students':
            $superAdmin->saStudentsList();
            break;
        case 'sa_faculty_list':
        case 'college_drill_faculty':
            $superAdmin->saFacultyList();
            break;
        case 'superadmin_create_college_admin':
            Session::requireRole($sessionCtx, ['super_admin']);
            require_method('POST');
            json_response($college->createCollegeAdmin(read_json_body()));
            break;
        case 'super_admin_users_list':
        case 'users_list':
            $superAdmin->usersList();
            break;
        case 'super_admin_user_update':
        case 'users_update':
            $superAdmin->usersUpdate();
            break;
        case 'users_delete':
            $superAdmin->usersDelete();
            break;
        case 'users_overview':
            $superAdmin->usersOverview();
            break;
        case 'users_create':
            $superAdmin->usersCreate();
            break;
        case 'generate_unique_id':
            $superAdmin->generateUniqueId();
            break;
        case 'generate_password':
            $superAdmin->generatePassword();
            break;
        case 'platform_settings_get':    $superAdmin->platformSettingsGet(); break;
        case 'platform_settings_update':
        case 'platform_settings_save':
            $superAdmin->platformSettingsSave();
            break;
        case 'platform_notice_get':
            $superAdmin->platformNoticeGet();
            break;
        case 'audit_logs_list':          $superAdmin->auditLogsList(); break;
        case 'super_admin_dashboard_summary': $superAdmin->dashboardSummary(); break;

        // -- College Admin --
        case 'college_admin_archive_list':    $collegeAdmin->archiveList(); break;
        case 'college_admin_user_update':     $collegeAdmin->userUpdate(); break;
        case 'college_admin_user_delete':     $collegeAdmin->userDelete(); break;
        case 'college_admin_user_purge':      $collegeAdmin->userPurge(); break;
        case 'college_admin_students_list':   $collegeAdmin->studentsList(); break;
        case 'college_admin_student_create':  $collegeAdmin->studentCreate(); break;
        case 'college_admin_student_bulk_import': $collegeAdmin->studentBulkImport(); break;
        case 'college_admin_student_update':  $collegeAdmin->studentUpdate(); break;
        case 'college_admin_faculty_list':    $collegeAdmin->facultyList(); break;
        case 'college_admin_faculty_create':  $collegeAdmin->facultyCreate(); break;
        case 'college_admin_faculty_update':  $collegeAdmin->facultyUpdate(); break;
        case 'college_admin_settings_get':
        case 'college_settings_get':
            $collegeAdmin->settingsGet();
            break;
        case 'college_admin_settings_update':
        case 'college_settings_save':
            $collegeAdmin->settingsSave();
            break;
        case 'college_admin_notices_list':
        case 'college_notices_list':
            $collegeAdmin->noticesList();
            break;
        case 'college_admin_notice_create':   $collegeAdmin->noticeCreate(); break;
        case 'college_admin_notice_delete':
        case 'college_admin_notice_archive':
            $collegeAdmin->noticeArchive();
            break;
        case 'college_admin_generate_unique_id':
            $collegeAdmin->generateUniqueId();
            break;
        case 'college_admin_dashboard_summary': $collegeAdmin->dashboardSummary(); break;

        // -- Academic (departments, courses, subjects) --
        case 'departments_list':          $academic->departmentsList(); break;
        case 'departments_save':          $academic->departmentsSave(); break;
        case 'departments_delete':        $academic->departmentsDelete(); break;
        case 'courses_list':              $academic->coursesList(); break;
        case 'courses_save':              $academic->coursesSave(); break;
        case 'courses_delete':            $academic->coursesDelete(); break;
        case 'course_subjects_list':      $academic->courseSubjectsList(); break;
        case 'course_subjects_save':      $academic->courseSubjectsSave(); break;
        case 'course_subjects_delete':    $academic->courseSubjectsDelete(); break;

        // -- Timetable --
        case 'timetable_list':            $timetable->list(); break;
        case 'timetable_create_manual':   $timetable->createManual(); break;
        case 'timetable_bulk_import':     $timetable->bulkImport(); break;
        case 'timetable_update_manual':   $timetable->updateManual(); break;
        case 'timetable_delete':          $timetable->delete(); break;

        // -- Faculty --
        case 'faculty_classes_today':     $faculty->classesToday(); break;
        case 'faculty_class_options':     $faculty->classOptions(); break;
        case 'faculty_department_students_list': $faculty->departmentStudentsList(); break;
        case 'faculty_student_profile_get':     $faculty->studentProfileGet(); break;
        case 'faculty_timetable_weekly':  $faculty->timetableWeekly(); break;
        case 'faculty_active_session':    $faculty->activeSession(); break;
        case 'faculty_recent_sessions':   $faculty->recentSessions(); break;
        case 'start_session':             $faculty->startSession(); break;
        case 'start_session_quick':       $faculty->startSessionQuick(); break;
        case 'end_session':               $faculty->endSession(); break;
        case 'session_results':           $faculty->sessionResults(); break;

        // -- Student --
        case 'student_dashboard_summary': $student->dashboardSummary(); break;
        case 'student_timetable_weekly':  $student->timetableWeekly(); break;
        case 'face_register':
        case 'register_face':              $student->faceRegister(); break;
        case 'face_profile':              $student->faceProfile(); break;

        // -- Attendance --
        case 'otp_preview':               $attendance->otpPreview(); break;
        case 'submit_otp':                $attendance->submitOtp(); break;
        case 'attendance_history':        $attendance->attendanceHistory(); break;
        case 'verify_face':               $attendance->verifyFace(); break;
        case 'verify_location':           $attendance->verifyLocation(); break;
        case 'mark_attendance':           $attendance->markAttendance(); break;
        case 'attendance_criteria_filters':    $attendance->criteriaFilters(); break;
        case 'attendance_semester_criteria':   $attendance->semesterCriteria(); break;
        case 'attendance_records_view':        $attendance->recordsView(); break;

        // -- Utilities --
        case 'db-test':
            $stmt = $pdo->query('SELECT 1 AS ok');
            $row = $stmt->fetch();
            json_response(['success' => true, 'db' => $row]);
            break;

        default:
            json_response(['success' => false, 'error' => 'Unknown action'], 404);
    }
} catch (Throwable $e) {
    error_log((string)$e);

    $error = 'Server error';
    if (APP_ENV !== 'production') {
        $error = $e->getMessage();
    } elseif ($e instanceof PDOException) {
        // Provide more context for connection failures to help the user debug .env issues
        $msg = $e->getMessage();
        if (strpos($msg, 'Connection timed out') !== false) {
            $error = 'Database connection failed: Connection timed out. Check if your DB_HOST is reachable.';
        } elseif (strpos($msg, 'Access denied') !== false) {
            $error = 'Database connection failed: Access denied. Verify DB_USER and DB_PASS in .env.';
        } else {
            $error = 'Database connection failed: ' . $msg;
        }
    } elseif ($e instanceof RuntimeException && str_starts_with($e->getMessage(), 'Database bootstrap failed')) {
        $error = $e->getMessage();
    }

    json_response(['success' => false, 'error' => $error], 500);
}
