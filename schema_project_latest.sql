-- AMS fresh schema generated from the current codebase.
-- Use this on a new empty database selected in phpMyAdmin / MySQL client.
-- This file is intentionally written from the live project structure
-- (controllers, services, helpers), not copied from the old dump.

SET NAMES utf8mb4;
SET time_zone = '+05:30';

CREATE TABLE `colleges` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL,
  `logo` VARCHAR(255) DEFAULT NULL,
  `contact` VARCHAR(255) DEFAULT NULL,
  `status` ENUM('active','inactive','removed') NOT NULL DEFAULT 'active',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `archived_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_colleges_status_archived` (`status`, `archived_at`),
  KEY `idx_colleges_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `users` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `unique_user_id` VARCHAR(64) NOT NULL,
  `college_id` BIGINT UNSIGNED DEFAULT NULL,
  `name` VARCHAR(255) NOT NULL,
  `email` VARCHAR(255) DEFAULT NULL,
  `profile_photo_path` VARCHAR(255) DEFAULT NULL,
  `profile_photo_data` LONGTEXT DEFAULT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `role` ENUM('super_admin','college_admin','faculty','student') NOT NULL,
  `status` ENUM('active','suspended','pending') NOT NULL DEFAULT 'active',
  `deleted_at` DATETIME DEFAULT NULL,
  `last_login` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_unique_user_id` (`unique_user_id`),
  UNIQUE KEY `uq_users_email` (`email`),
  KEY `idx_users_college_role_status` (`college_id`, `role`, `status`),
  KEY `idx_users_deleted_at` (`deleted_at`),
  CONSTRAINT `fk_users_college`
    FOREIGN KEY (`college_id`) REFERENCES `colleges` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `departments` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `college_id` BIGINT UNSIGNED NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `status` ENUM('active','inactive') NOT NULL DEFAULT 'active',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_departments` (`college_id`, `name`),
  KEY `idx_departments_college_status` (`college_id`, `status`),
  CONSTRAINT `fk_departments_college`
    FOREIGN KEY (`college_id`) REFERENCES `colleges` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `college_settings` (
  `college_id` BIGINT UNSIGNED NOT NULL,
  `short_code` VARCHAR(50) DEFAULT NULL,
  `contact_email` VARCHAR(255) DEFAULT NULL,
  `contact_phone` VARCHAR(50) DEFAULT NULL,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`college_id`),
  CONSTRAINT `fk_college_settings_college`
    FOREIGN KEY (`college_id`) REFERENCES `colleges` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `college_location_settings` (
  `college_id` BIGINT UNSIGNED NOT NULL,
  `latitude` DECIMAL(10,8) NOT NULL,
  `longitude` DECIMAL(11,8) NOT NULL,
  `radius_meters` INT UNSIGNED NOT NULL DEFAULT 200,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`college_id`),
  CONSTRAINT `fk_college_location_settings`
    FOREIGN KEY (`college_id`) REFERENCES `colleges` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `user_profiles` (
  `user_id` BIGINT UNSIGNED NOT NULL,
  `phone` VARCHAR(50) DEFAULT NULL,
  `hobbies` TEXT DEFAULT NULL,
  `department_info` TEXT DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  CONSTRAINT `fk_user_profiles_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `faculty` (
  `faculty_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `dept_id` BIGINT UNSIGNED NOT NULL,
  `designation` VARCHAR(255) DEFAULT NULL,
  PRIMARY KEY (`faculty_id`),
  UNIQUE KEY `uq_faculty_user` (`user_id`),
  KEY `idx_faculty_dept` (`dept_id`),
  CONSTRAINT `fk_faculty_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_faculty_dept`
    FOREIGN KEY (`dept_id`) REFERENCES `departments` (`id`)
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `students` (
  `student_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `dept_id` BIGINT UNSIGNED NOT NULL,
  `course` VARCHAR(255) DEFAULT NULL,
  `year` TINYINT UNSIGNED NOT NULL,
  `semester` TINYINT UNSIGNED NOT NULL DEFAULT 1,
  `section` VARCHAR(10) NOT NULL,
  `face_registered` TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`student_id`),
  UNIQUE KEY `uq_students_user` (`user_id`),
  KEY `idx_students_dept` (`dept_id`),
  KEY `idx_students_class` (`dept_id`, `year`, `semester`, `section`),
  KEY `idx_students_course_lookup` (`dept_id`, `course`, `year`, `semester`, `section`),
  CONSTRAINT `fk_students_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_students_dept`
    FOREIGN KEY (`dept_id`) REFERENCES `departments` (`id`)
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `courses_sections` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `dept_id` BIGINT UNSIGNED NOT NULL,
  `course_name` VARCHAR(255) NOT NULL,
  `year` TINYINT UNSIGNED NOT NULL,
  `semester` TINYINT UNSIGNED NOT NULL DEFAULT 1,
  `section` VARCHAR(10) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_courses_sections` (`dept_id`, `course_name`, `year`, `semester`, `section`),
  KEY `idx_courses_sections_class` (`dept_id`, `year`, `semester`, `section`),
  CONSTRAINT `fk_courses_sections_dept`
    FOREIGN KEY (`dept_id`) REFERENCES `departments` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `course_subjects` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `course_id` BIGINT UNSIGNED NOT NULL,
  `subject_name` VARCHAR(255) NOT NULL,
  `subject_code` VARCHAR(64) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_course_subject_code` (`course_id`, `subject_code`),
  UNIQUE KEY `uq_course_subject_name` (`course_id`, `subject_name`),
  CONSTRAINT `fk_course_subjects_course`
    FOREIGN KEY (`course_id`) REFERENCES `courses_sections` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `timetable` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `college_id` BIGINT UNSIGNED NOT NULL,
  `course_id` BIGINT UNSIGNED NOT NULL,
  `faculty_id` BIGINT UNSIGNED NOT NULL,
  `day_of_week` TINYINT UNSIGNED NOT NULL,
  `start_time` TIME NOT NULL,
  `end_time` TIME NOT NULL,
  `subject` VARCHAR(255) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_timetable_slot` (`college_id`, `course_id`, `day_of_week`, `start_time`, `end_time`),
  KEY `idx_timetable_faculty_day` (`faculty_id`, `day_of_week`, `start_time`),
  KEY `idx_timetable_course_faculty` (`course_id`, `faculty_id`),
  CONSTRAINT `fk_timetable_college`
    FOREIGN KEY (`college_id`) REFERENCES `colleges` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_timetable_course`
    FOREIGN KEY (`course_id`) REFERENCES `courses_sections` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_timetable_faculty`
    FOREIGN KEY (`faculty_id`) REFERENCES `faculty` (`faculty_id`)
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `attendance_sessions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `college_id` BIGINT UNSIGNED NOT NULL,
  `faculty_id` BIGINT UNSIGNED NOT NULL,
  `course_id` BIGINT UNSIGNED NOT NULL,
  `subject` VARCHAR(255) NOT NULL,
  `extra_reason` VARCHAR(255) DEFAULT NULL,
  `otp_code` CHAR(6) NOT NULL,
  `otp_expiry` DATETIME NOT NULL,
  `start_time` DATETIME NOT NULL,
  `end_time` DATETIME DEFAULT NULL,
  `status` ENUM('scheduled','active','closed','cancelled') NOT NULL DEFAULT 'active',
  PRIMARY KEY (`id`),
  KEY `idx_att_sess_college_status_start` (`college_id`, `status`, `start_time`),
  KEY `idx_att_sess_college_otp` (`college_id`, `otp_code`, `status`, `otp_expiry`),
  KEY `idx_att_sess_faculty_status` (`faculty_id`, `status`, `start_time`),
  KEY `idx_att_sess_course` (`course_id`),
  CONSTRAINT `fk_att_sess_college`
    FOREIGN KEY (`college_id`) REFERENCES `colleges` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_att_sess_faculty`
    FOREIGN KEY (`faculty_id`) REFERENCES `faculty` (`faculty_id`)
    ON UPDATE CASCADE,
  CONSTRAINT `fk_att_sess_course`
    FOREIGN KEY (`course_id`) REFERENCES `courses_sections` (`id`)
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `password_resets` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `otp_hash` VARCHAR(255) NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_password_resets_user` (`user_id`),
  CONSTRAINT `fk_password_resets_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `college_notices` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `college_id` BIGINT UNSIGNED NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `message` TEXT NOT NULL,
  `audience` ENUM('all','students','faculty') NOT NULL DEFAULT 'all',
  `created_by_user_id` BIGINT UNSIGNED DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` DATETIME DEFAULT NULL,
  `archived_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_college_notices_college_created` (`college_id`, `created_at`),
  KEY `idx_college_notices_audience` (`audience`),
  KEY `idx_college_notices_expires_at` (`expires_at`),
  CONSTRAINT `fk_college_notices_college`
    FOREIGN KEY (`college_id`) REFERENCES `colleges` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_college_notices_created_by`
    FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `platform_settings` (
  `setting_key` VARCHAR(100) NOT NULL,
  `setting_value` TEXT DEFAULT NULL,
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `audit_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED DEFAULT NULL,
  `action` VARCHAR(255) NOT NULL,
  `ip_address` VARCHAR(45) DEFAULT NULL,
  `timestamp` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `metadata` LONGTEXT DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_audit_logs_user_timestamp` (`user_id`, `timestamp`),
  KEY `idx_audit_logs_action_timestamp` (`action`, `timestamp`),
  CONSTRAINT `fk_audit_logs_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `face_embeddings` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id` BIGINT UNSIGNED NOT NULL,
  `embedding_vector` LONGTEXT NOT NULL,
  `embedding_type` ENUM('front','left','right','up','down','neutral','glasses') DEFAULT 'front',
  `quality_score` DECIMAL(5,2) DEFAULT NULL,
  `registered_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_face_embeddings_student` (`student_id`),
  KEY `idx_face_embeddings_student_type` (`student_id`, `embedding_type`),
  CONSTRAINT `fk_face_embeddings_student`
    FOREIGN KEY (`student_id`) REFERENCES `students` (`student_id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `face_registration_updates` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id` BIGINT UNSIGNED NOT NULL,
  `action` ENUM('register','update') NOT NULL DEFAULT 'update',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_face_reg_updates_student_created` (`student_id`, `created_at`),
  KEY `idx_face_reg_updates_action_created` (`action`, `created_at`),
  CONSTRAINT `fk_face_reg_updates_student`
    FOREIGN KEY (`student_id`) REFERENCES `students` (`student_id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `otp_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `session_id` BIGINT UNSIGNED NOT NULL,
  `student_id` BIGINT UNSIGNED NOT NULL,
  `verified` TINYINT(1) NOT NULL DEFAULT 0,
  `timestamp` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_otp_session_student` (`session_id`, `student_id`),
  KEY `idx_otp_logs_student` (`student_id`),
  KEY `idx_otp_logs_timestamp` (`timestamp`),
  CONSTRAINT `fk_otp_logs_session`
    FOREIGN KEY (`session_id`) REFERENCES `attendance_sessions` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_otp_logs_student`
    FOREIGN KEY (`student_id`) REFERENCES `students` (`student_id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `face_verification_attempts` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `session_id` BIGINT UNSIGNED NOT NULL,
  `student_id` BIGINT UNSIGNED NOT NULL,
  `attempts_used` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `last_match_score` DECIMAL(5,2) DEFAULT NULL,
  `last_decision` VARCHAR(16) DEFAULT NULL,
  `locked` TINYINT(1) NOT NULL DEFAULT 0,
  `locked_reason` VARCHAR(255) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_face_attempt_session_student` (`session_id`, `student_id`),
  KEY `idx_face_attempts_student` (`student_id`),
  KEY `idx_face_attempts_locked` (`locked`),
  CONSTRAINT `fk_face_attempt_session`
    FOREIGN KEY (`session_id`) REFERENCES `attendance_sessions` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_face_attempt_student`
    FOREIGN KEY (`student_id`) REFERENCES `students` (`student_id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `attendance_records` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `session_id` BIGINT UNSIGNED NOT NULL,
  `student_id` BIGINT UNSIGNED NOT NULL,
  `timestamp` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `match_score` DECIMAL(5,2) DEFAULT NULL,
  `location_lat` DECIMAL(10,8) DEFAULT NULL,
  `location_lng` DECIMAL(11,8) DEFAULT NULL,
  `location_verified` TINYINT(1) NOT NULL DEFAULT 0,
  `status` ENUM('present','rejected','duplicate','late','invalid_otp','location_out_of_range') NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_att_record_session_student` (`session_id`, `student_id`),
  KEY `idx_att_record_timestamp` (`timestamp`),
  KEY `idx_att_record_student_status` (`student_id`, `status`),
  KEY `idx_att_record_location_verified` (`location_verified`),
  CONSTRAINT `fk_att_records_session`
    FOREIGN KEY (`session_id`) REFERENCES `attendance_sessions` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_att_records_student`
    FOREIGN KEY (`student_id`) REFERENCES `students` (`student_id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `attendance_manual_requests` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `session_id` BIGINT UNSIGNED NOT NULL,
  `student_id` BIGINT UNSIGNED NOT NULL,
  `requested_by_user_id` BIGINT UNSIGNED DEFAULT NULL,
  `reason` TEXT NOT NULL,
  `status` ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `reviewed_by_user_id` BIGINT UNSIGNED DEFAULT NULL,
  `review_notes` TEXT DEFAULT NULL,
  `requested_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `reviewed_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_att_manual_req_session` (`session_id`),
  KEY `idx_att_manual_req_student` (`student_id`),
  KEY `idx_att_manual_req_status` (`status`, `requested_at`),
  KEY `idx_att_manual_req_requested_by` (`requested_by_user_id`),
  KEY `idx_att_manual_req_reviewed_by` (`reviewed_by_user_id`),
  CONSTRAINT `fk_att_manual_req_session`
    FOREIGN KEY (`session_id`) REFERENCES `attendance_sessions` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_att_manual_req_student`
    FOREIGN KEY (`student_id`) REFERENCES `students` (`student_id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_att_manual_req_requested_by`
    FOREIGN KEY (`requested_by_user_id`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_att_manual_req_reviewed_by`
    FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
