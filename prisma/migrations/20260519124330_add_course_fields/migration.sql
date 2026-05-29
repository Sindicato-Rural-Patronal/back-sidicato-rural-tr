/*
  Warnings:

  - Added the required column `endTime` to the `course` table without a default value. This is not possible if the table is not empty.
  - Added the required column `startTime` to the `course` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "course" ADD COLUMN     "bannerUrl" TEXT,
ADD COLUMN     "endTime" TIMESTAMP(3) NOT NULL DEFAULT '2000-01-01 00:00:00',
ADD COLUMN     "location" TEXT,
ADD COLUMN     "observations" TEXT,
ADD COLUMN     "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "registrationDeadline" TIMESTAMP(3),
ADD COLUMN     "startTime" TIMESTAMP(3) NOT NULL DEFAULT '2000-01-01 00:00:00',
ADD COLUMN     "workloadHours" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "course" ALTER COLUMN "startTime" DROP DEFAULT;
ALTER TABLE "course" ALTER COLUMN "endTime" DROP DEFAULT;

-- CreateTable
CREATE TABLE "UserIstructor" (
    "id" TEXT NOT NULL,
    "userDataId" TEXT NOT NULL,

    CONSTRAINT "UserIstructor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoursePhoto" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "caption" TEXT,
    "courseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoursePhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "maxCapacity" INTEGER NOT NULL,

    CONSTRAINT "room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_UserIstructorTocourse" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_UserIstructorTocourse_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserIstructor_userDataId_key" ON "UserIstructor"("userDataId");

-- CreateIndex
CREATE INDEX "_UserIstructorTocourse_B_index" ON "_UserIstructorTocourse"("B");

-- AddForeignKey
ALTER TABLE "UserIstructor" ADD CONSTRAINT "UserIstructor_userDataId_fkey" FOREIGN KEY ("userDataId") REFERENCES "UserData"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoursePhoto" ADD CONSTRAINT "CoursePhoto_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UserIstructorTocourse" ADD CONSTRAINT "_UserIstructorTocourse_A_fkey" FOREIGN KEY ("A") REFERENCES "UserIstructor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UserIstructorTocourse" ADD CONSTRAINT "_UserIstructorTocourse_B_fkey" FOREIGN KEY ("B") REFERENCES "course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
