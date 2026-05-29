/*
  Warnings:

  - A unique constraint covering the columns `[cpf]` on the table `UserData` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `cpf` to the `UserData` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "UserData" ADD COLUMN     "avatar" TEXT,
ADD COLUMN     "cpf" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "course" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "maxRegistrations" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courseUserRegistration" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "userDataId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courseUserRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserData_cpf_key" ON "UserData"("cpf");

-- AddForeignKey
ALTER TABLE "courseUserRegistration" ADD CONSTRAINT "courseUserRegistration_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courseUserRegistration" ADD CONSTRAINT "courseUserRegistration_userDataId_fkey" FOREIGN KEY ("userDataId") REFERENCES "UserData"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
