-- DropTable (FK constraints were already removed by a previously failed migration attempt)
DROP TABLE "_UserInstructorTocourse";

-- AlterTable: rename PK constraint (typo fix: UserIstructor -> UserInstructor)
ALTER TABLE "UserInstructor" RENAME CONSTRAINT "UserIstructor_pkey" TO "UserInstructor_pkey";

-- AlterTable: add bio column
ALTER TABLE "UserInstructor" ADD COLUMN "bio" TEXT;

-- CreateTable
CREATE TABLE "CourseInstructor" (
    "id" TEXT NOT NULL,
    "title" TEXT,
    "category" TEXT,
    "instructorId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseInstructor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CourseInstructor_instructorId_courseId_key" ON "CourseInstructor"("instructorId", "courseId");

-- RenameForeignKey
ALTER TABLE "UserInstructor" RENAME CONSTRAINT "UserIstructor_userDataId_fkey" TO "UserInstructor_userDataId_fkey";

-- AddForeignKey
ALTER TABLE "CourseInstructor" ADD CONSTRAINT "CourseInstructor_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "UserInstructor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseInstructor" ADD CONSTRAINT "CourseInstructor_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "UserIstructor_userDataId_key" RENAME TO "UserInstructor_userDataId_key";

-- Restore Property FK (was dropped by a previously failed migration attempt; idempotent for shadow DB)
DO $$ BEGIN
  ALTER TABLE "Property" ADD CONSTRAINT "Property_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
