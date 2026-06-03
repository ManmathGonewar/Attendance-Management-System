-- Super Admin credential seed template for AMS
-- Do not store real credentials in this tracked file.
-- Preferred flow:
-- 1. Put local values in .env.superadmin (ignored by Git).
-- 2. Run ./scripts/generate_superadmin_credentials.sh
-- 3. Execute scripts/superadmin_credentials.local.sql on the target database.

SET @sa_unique_user_id = 'REPLACE_WITH_SUPERADMIN_UNIQUE_USER_ID';
SET @sa_name = 'REPLACE_WITH_SUPERADMIN_NAME';
SET @sa_password_hash = 'REPLACE_WITH_BCRYPT_PASSWORD_HASH';

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
