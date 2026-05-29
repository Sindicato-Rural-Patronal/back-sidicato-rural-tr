/*
  Warnings:

  - You are about to drop the column `location` on the `course` table. All the data in the column will be lost.
  - You are about to drop the column `maxRegistrations` on the `course` table. All the data in the column will be lost.
  - Added the required column `roomId` to the `course` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `room` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "course" DROP COLUMN "location",
DROP COLUMN "maxRegistrations",
ADD COLUMN     "roomId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "room" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AddForeignKey
ALTER TABLE "course" ADD CONSTRAINT "course_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
