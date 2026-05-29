/*
  Warnings:

  - You are about to drop the column `passwordhash` on the `UserAdmin` table. All the data in the column will be lost.
  - Added the required column `passwordHash` to the `UserAdmin` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "UserAdmin" DROP COLUMN "passwordhash",
ADD COLUMN     "passwordHash" TEXT NOT NULL;
