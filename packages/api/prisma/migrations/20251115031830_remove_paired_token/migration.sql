/*
  Warnings:

  - You are about to drop the column `pairedToken` on the `deployments` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "deployments" DROP COLUMN "pairedToken";
