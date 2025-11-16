-- AlterTable
ALTER TABLE "deployments" ADD COLUMN     "pairedToken" VARCHAR(42),
ADD COLUMN     "poolId" VARCHAR(66);
