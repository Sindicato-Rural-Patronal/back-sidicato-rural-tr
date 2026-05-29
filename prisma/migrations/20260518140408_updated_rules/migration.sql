/*
  Warnings:

  - A unique constraint covering the columns `[cnpj]` on the table `UserData` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "permitions" ADD VALUE 'CREATE_COURSE';
ALTER TYPE "permitions" ADD VALUE 'UPDATE_COURSE';
ALTER TYPE "permitions" ADD VALUE 'DELETE_COURSE';
ALTER TYPE "permitions" ADD VALUE 'READ_COURSE';
ALTER TYPE "permitions" ADD VALUE 'CREATE_RULE';
ALTER TYPE "permitions" ADD VALUE 'UPDATE_RULE';
ALTER TYPE "permitions" ADD VALUE 'DELETE_RULE';
ALTER TYPE "permitions" ADD VALUE 'READ_RULE';
ALTER TYPE "permitions" ADD VALUE 'CREATE_USER_ADMIN';
ALTER TYPE "permitions" ADD VALUE 'UPDATE_USER_ADMIN';
ALTER TYPE "permitions" ADD VALUE 'DELETE_USER_ADMIN';
ALTER TYPE "permitions" ADD VALUE 'READ_USER_ADMIN';

-- AlterTable
ALTER TABLE "UserData" ADD COLUMN     "cnpj" TEXT,
ALTER COLUMN "cpf" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "UserData_cnpj_key" ON "UserData"("cnpj");
