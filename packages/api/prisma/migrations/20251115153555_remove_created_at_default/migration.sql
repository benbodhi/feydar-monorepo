-- AlterTable: Remove default from createdAt
-- createdAt must always be explicitly set to block timestamp, never use database default
ALTER TABLE "deployments" ALTER COLUMN "createdAt" DROP DEFAULT;

