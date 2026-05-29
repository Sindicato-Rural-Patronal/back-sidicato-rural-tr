-- CreateEnum
CREATE TYPE "NewsStatus" AS ENUM ('PUBLICADO', 'NAO_PUBLICADO');

-- AlterEnum
ALTER TYPE "permitions" ADD VALUE 'CREATE_NEWS';
ALTER TYPE "permitions" ADD VALUE 'UPDATE_NEWS';
ALTER TYPE "permitions" ADD VALUE 'DELETE_NEWS';
ALTER TYPE "permitions" ADD VALUE 'READ_NEWS';

-- CreateTable
CREATE TABLE "News" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "summary" TEXT,
    "bannerUrl" TEXT,
    "status" "NewsStatus" NOT NULL DEFAULT 'NAO_PUBLICADO',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "News_pkey" PRIMARY KEY ("id")
);
