-- Add autoApproveQuestions flag to email settings
ALTER TABLE `EmailSetting` ADD COLUMN `autoApproveQuestions` BOOLEAN NOT NULL DEFAULT false;
