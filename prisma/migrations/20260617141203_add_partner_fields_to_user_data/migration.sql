-- AlterTable
ALTER TABLE "UserData" ADD COLUMN     "isPartner" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "partnerOrder" INTEGER,
ADD COLUMN     "partnerUrl" TEXT;
