-- Complete database synchronization script for Digital Ocean
-- Execute this in your Digital Ocean MySQL console
-- This script is idempotent - you can run it multiple times safely

-- ============================================
-- 1. EmailSetting table - Add missing columns
-- ============================================

-- Add email template columns if they don't exist
SET @query = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME = 'EmailSetting'
   AND COLUMN_NAME = 'answerEmailSubject') = 0,
  'ALTER TABLE `EmailSetting` ADD COLUMN `answerEmailSubject` TEXT NULL',
  'SELECT "Column answerEmailSubject already exists" as message'
);
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @query = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME = 'EmailSetting'
   AND COLUMN_NAME = 'answerEmailBody') = 0,
  'ALTER TABLE `EmailSetting` ADD COLUMN `answerEmailBody` TEXT NULL',
  'SELECT "Column answerEmailBody already exists" as message'
);
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @query = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME = 'EmailSetting'
   AND COLUMN_NAME = 'questionPublishedSubject') = 0,
  'ALTER TABLE `EmailSetting` ADD COLUMN `questionPublishedSubject` TEXT NULL',
  'SELECT "Column questionPublishedSubject already exists" as message'
);
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @query = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME = 'EmailSetting'
   AND COLUMN_NAME = 'questionPublishedEmailBody') = 0,
  'ALTER TABLE `EmailSetting` ADD COLUMN `questionPublishedEmailBody` TEXT NULL',
  'SELECT "Column questionPublishedEmailBody already exists" as message'
);
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @query = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME = 'EmailSetting'
   AND COLUMN_NAME = 'newQuestionAdminSubject') = 0,
  'ALTER TABLE `EmailSetting` ADD COLUMN `newQuestionAdminSubject` TEXT NULL',
  'SELECT "Column newQuestionAdminSubject already exists" as message'
);
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @query = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME = 'EmailSetting'
   AND COLUMN_NAME = 'newQuestionAdminEmailBody') = 0,
  'ALTER TABLE `EmailSetting` ADD COLUMN `newQuestionAdminEmailBody` TEXT NULL',
  'SELECT "Column newQuestionAdminEmailBody already exists" as message'
);
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================
-- 2. Verify synchronization
-- ============================================

-- Count total columns (should be 20)
SELECT
  'EmailSetting columns:' as info,
  COUNT(*) as total_columns
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'EmailSetting';

-- List all columns for verification
SELECT
  COLUMN_NAME,
  COLUMN_TYPE,
  IS_NULLABLE,
  COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'EmailSetting'
ORDER BY ORDINAL_POSITION;

-- Mark migration as applied in _prisma_migrations if not already there
INSERT IGNORE INTO `_prisma_migrations`
  (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES
  (UUID(), 'bb997810ddbbb5cd69f9e306a0e421a18df1b9f7ac647a81b2c7bf2caee57330', NOW(), '20251001000000_add_auto_approve_questions', NULL, NULL, NOW(), 1);

SELECT 'Database synchronization completed successfully!' as status;
