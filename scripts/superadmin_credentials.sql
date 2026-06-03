-- Super Admin credential seed for AMS
-- Login ID: SUPERADMIN001
-- Password: Ams@2026#Super
-- Change the password after first login.

SET @sa_unique_user_id = 'SUPERADMIN001';
SET @sa_name = 'AMS Super Admin';
SET @sa_password_hash = '$2y$12$4TjSE9k4FRce/7f/n.7tVu2k2h6DR7QSImVW5KpdlJxMx3W9cIt5.';

UPDATE `users`
SET
  `college_id` = NULL,
  `name` = @sa_name,
  `email` = NULL,
  `password_hash` = @sa_password_hash,
  `role` = 'super_admin',
  `status` = 'active',
  `deleted_at` = NULL
WHERE `unique_user_id` = @sa_unique_user_id;

INSERT INTO `users` (
  `unique_user_id`,
  `college_id`,
  `name`,
  `email`,
  `password_hash`,
  `role`,
  `status`,
  `deleted_at`,
  `last_login`
)
SELECT
  @sa_unique_user_id,
  NULL,
  @sa_name,
  NULL,
  @sa_password_hash,
  'super_admin',
  'active',
  NULL,
  NULL
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1
  FROM `users`
  WHERE `unique_user_id` = @sa_unique_user_id
);

SELECT `id`, `unique_user_id`, `name`, `role`, `status`
FROM `users`
WHERE `unique_user_id` = @sa_unique_user_id;
