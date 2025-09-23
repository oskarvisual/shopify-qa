-- AlterTable
ALTER TABLE `Question` ADD COLUMN `votes` INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `VoteLog` (
    `id` VARCHAR(191) NOT NULL,
    `questionId` VARCHAR(191) NOT NULL,
    `shop` VARCHAR(191) NOT NULL,
    `identifier` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `VoteLog_questionId_idx`(`questionId`),
    UNIQUE INDEX `VoteLog_questionId_identifier_shop_key`(`questionId`, `identifier`, `shop`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `VoteLog` ADD CONSTRAINT `VoteLog_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `Question`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
