-- CreateTable AiSetting
CREATE TABLE `AiSetting` (
  `id` VARCHAR(191) NOT NULL,
  `shop` VARCHAR(191) NOT NULL,
  `aiEnabled` BOOLEAN NOT NULL DEFAULT false,
  `aiLanguage` VARCHAR(191) NOT NULL DEFAULT 'English',
  `aiInstructions` TEXT NULL,
  `aiFrontendEnabled` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `AiSetting_shop_key`(`shop`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable AiLog
CREATE TABLE `AiLog` (
  `id` VARCHAR(191) NOT NULL,
  `shop` VARCHAR(191) NOT NULL,
  `productId` VARCHAR(191) NOT NULL,
  `customerQuestion` TEXT NOT NULL,
  `aiAnswer` TEXT NULL,
  `fullContext` LONGTEXT NULL,
  `vote` INTEGER NULL,
  `askedHuman` BOOLEAN NOT NULL DEFAULT false,
  `noAnswer` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `AiLog_shop_productId_idx`(`shop`, `productId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable AiFeedback
CREATE TABLE `AiFeedback` (
  `id` VARCHAR(191) NOT NULL,
  `aiLogId` VARCHAR(191) NOT NULL,
  `adminUserId` VARCHAR(191) NOT NULL,
  `adminUserName` VARCHAR(191) NULL,
  `rating` INTEGER NOT NULL,
  `feedbackText` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `AiFeedback_aiLogId_adminUserId_key`(`aiLogId`, `adminUserId`),
  INDEX `AiFeedback_aiLogId_idx`(`aiLogId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `AiFeedback` ADD CONSTRAINT `AiFeedback_aiLogId_fkey` FOREIGN KEY (`aiLogId`) REFERENCES `AiLog`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
