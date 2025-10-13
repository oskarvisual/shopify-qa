-- Fix production database schema
-- Execute this SQL directly in your Digital Ocean database console
-- Run each ALTER TABLE separately and ignore "Duplicate column" errors

-- Check current structure first
DESCRIBE `EmailSetting`;

-- Add missing email template columns (run one by one, ignore errors if column exists)
ALTER TABLE `EmailSetting` ADD COLUMN `answerEmailSubject` TEXT NULL;
ALTER TABLE `EmailSetting` ADD COLUMN `answerEmailBody` TEXT NULL;
ALTER TABLE `EmailSetting` ADD COLUMN `questionPublishedSubject` TEXT NULL;
ALTER TABLE `EmailSetting` ADD COLUMN `questionPublishedEmailBody` TEXT NULL;
ALTER TABLE `EmailSetting` ADD COLUMN `newQuestionAdminSubject` TEXT NULL;
ALTER TABLE `EmailSetting` ADD COLUMN `newQuestionAdminEmailBody` TEXT NULL;

-- Verify all columns are present (should show 20 columns)
SELECT COUNT(*) as total_columns
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'EmailSetting';

-- List all columns
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'EmailSetting'
ORDER BY ORDINAL_POSITION;
