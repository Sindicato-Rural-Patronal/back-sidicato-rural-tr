-- Rename enum type: permitions -> Permission
ALTER TYPE "permitions" RENAME TO "Permission";

-- Rename column: Rule.permitions -> Rule.permissions
ALTER TABLE "Rule" RENAME COLUMN "permitions" TO "permissions";

-- Rename CourseStatus enum values
ALTER TYPE "CourseStatus" RENAME VALUE 'PUBLICO' TO 'PUBLIC';
ALTER TYPE "CourseStatus" RENAME VALUE 'PRIVADO' TO 'PRIVATE';
ALTER TYPE "CourseStatus" RENAME VALUE 'NAO_PUBLICADO' TO 'UNPUBLISHED';

-- Rename NewsStatus enum values
ALTER TYPE "NewsStatus" RENAME VALUE 'PUBLICADO' TO 'PUBLISHED';
ALTER TYPE "NewsStatus" RENAME VALUE 'NAO_PUBLICADO' TO 'UNPUBLISHED';

-- Rename table: UserIstructor -> UserInstructor (typo fix)
ALTER TABLE "UserIstructor" RENAME TO "UserInstructor";
