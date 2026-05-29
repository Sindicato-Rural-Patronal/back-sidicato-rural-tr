-- CreateEnum
CREATE TYPE "CourseStatus" AS ENUM ('PUBLICO', 'PRIVADO', 'NAO_PUBLICADO');

-- AlterTable
ALTER TABLE "course" ADD COLUMN     "status" "CourseStatus" NOT NULL DEFAULT 'NAO_PUBLICADO';
