-- AlterTable
ALTER TABLE "deployments" ADD COLUMN     "deployerBasename" VARCHAR(255),
ADD COLUMN     "deployerENS" VARCHAR(255);
