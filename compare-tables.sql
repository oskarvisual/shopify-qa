-- Script to compare table structures
-- Execute this in Digital Ocean MySQL console and share the results

-- Get column count for each table
SELECT
  TABLE_NAME,
  COUNT(*) as column_count
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME NOT LIKE '_prisma%'
GROUP BY TABLE_NAME
ORDER BY TABLE_NAME;

-- Detailed column information for all tables
SELECT
  TABLE_NAME,
  COLUMN_NAME,
  COLUMN_TYPE,
  IS_NULLABLE,
  COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME NOT LIKE '_prisma%'
ORDER BY TABLE_NAME, ORDINAL_POSITION;
