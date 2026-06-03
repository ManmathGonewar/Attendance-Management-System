-- Fix / create `college_location_settings` with a compatible FK to `colleges(id)`.
-- Useful when importing into an existing database where `colleges.id` type differs (INT vs BIGINT, signed vs unsigned).
--
-- Usage (phpMyAdmin / MySQL):
--   1) Select the target database
--   2) Run this script

ALTER TABLE colleges ENGINE=InnoDB;

SET @college_id_type := (
  SELECT COLUMN_TYPE
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'colleges'
    AND COLUMN_NAME = 'id'
  LIMIT 1
);

SET @college_id_type := IF(@college_id_type IS NULL OR @college_id_type = '', 'BIGINT UNSIGNED', @college_id_type);

SET @sql := CONCAT(
  'CREATE TABLE IF NOT EXISTS college_location_settings (',
  '  college_id ', @college_id_type, ' NOT NULL,',
  '  latitude DECIMAL(10,8) NOT NULL,',
  '  longitude DECIMAL(10,8) NOT NULL,',
  '  radius_meters INT UNSIGNED NOT NULL DEFAULT 200,',
  '  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,',
  '  PRIMARY KEY (college_id)',
  ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add FK if it doesn't exist (ignore errors on incompatible schemas).
SET @fk_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'college_location_settings'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
    AND CONSTRAINT_NAME = 'fk_college_location_settings'
);

SET @sql2 := IF(@fk_exists = 0,
  'ALTER TABLE college_location_settings ADD CONSTRAINT fk_college_location_settings FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE CASCADE ON UPDATE CASCADE;',
  'SELECT 1;'
);

PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;
