-- Fix production database schema
-- Execute this SQL directly in your Digital Ocean database console

-- First, check current structure (copy the result to compare)
DESCRIBE `EmailSetting`;

-- Add autoApproveQuestions column (run this and ignore error if column exists)
ALTER TABLE `EmailSetting` ADD COLUMN `autoApproveQuestions` BOOLEAN NOT NULL DEFAULT false;

-- Verify the column was added
SELECT COLUMN_NAME
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'EmailSetting'
  AND COLUMN_NAME = 'autoApproveQuestions';
