/*
  Warnings:

  - You are about to drop the column `addressId` on the `UserData` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "UserData" DROP CONSTRAINT "UserData_addressId_fkey";

-- AlterTable
ALTER TABLE "UserData" DROP COLUMN "addressId";
