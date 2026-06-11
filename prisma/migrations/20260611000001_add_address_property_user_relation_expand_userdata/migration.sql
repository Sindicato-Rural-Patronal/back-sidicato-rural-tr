-- CreateEnum
CREATE TYPE "MaritalStatus" AS ENUM ('SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED', 'DOMESTIC_PARTNERSHIP');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "Ethnicity" AS ENUM ('WHITE', 'BLACK', 'MIXED', 'ASIAN', 'INDIGENOUS');

-- CreateEnum
CREATE TYPE "EducationLevel" AS ENUM ('NO_FORMAL_EDUCATION', 'INCOMPLETE_PRIMARY', 'COMPLETE_PRIMARY', 'INCOMPLETE_SECONDARY', 'COMPLETE_SECONDARY', 'INCOMPLETE_HIGHER', 'COMPLETE_HIGHER', 'POSTGRADUATE');

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "AddressType" AS ENUM ('URBAN', 'RURAL');

-- CreateTable
CREATE TABLE "Address" (
    "id" TEXT NOT NULL,
    "type" "AddressType" NOT NULL DEFAULT 'URBAN',
    "city" TEXT,
    "state" TEXT,
    "zipCode" TEXT,
    "complement" TEXT,
    "notes" TEXT,
    "street" TEXT,
    "number" TEXT,
    "neighborhood" TEXT,
    "localityName" TEXT,
    "road" TEXT,
    "km" TEXT,
    "lot" TEXT,
    "section" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Property" (
    "id" TEXT NOT NULL,
    "userDataId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "registration" TEXT,
    "addressId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRelation" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRelation_pkey" PRIMARY KEY ("id")
);

-- AlterTable: expand UserData with new optional fields
ALTER TABLE "UserData"
    ADD COLUMN "nickname" TEXT,
    ADD COLUMN "maritalStatus" "MaritalStatus",
    ADD COLUMN "phone2" TEXT,
    ADD COLUMN "phone3" TEXT,
    ADD COLUMN "rg" TEXT,
    ADD COLUMN "rgIssuer" TEXT,
    ADD COLUMN "rgIssuedAt" TIMESTAMP(3),
    ADD COLUMN "birthDate" TIMESTAMP(3),
    ADD COLUMN "driverLicense" TEXT,
    ADD COLUMN "driverLicenseCategory" TEXT,
    ADD COLUMN "birthPlace" TEXT,
    ADD COLUMN "nationality" TEXT,
    ADD COLUMN "gender" "Gender",
    ADD COLUMN "ethnicity" "Ethnicity",
    ADD COLUMN "educationLevel" "EducationLevel",
    ADD COLUMN "functionalCategory" TEXT,
    ADD COLUMN "specialNeeds" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "memberClassification" TEXT,
    ADD COLUMN "cadPro" TEXT,
    ADD COLUMN "familyIncome" TEXT,
    ADD COLUMN "memberType" TEXT,
    ADD COLUMN "boardPosition" TEXT,
    ADD COLUMN "boardMember" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "memberStatus" "MemberStatus",
    ADD COLUMN "memberSince" TIMESTAMP(3),
    ADD COLUMN "memberNotes" TEXT,
    ADD COLUMN "memberNotesNumber" TEXT,
    ADD COLUMN "addressId" TEXT;

-- AlterTable: add address to room
ALTER TABLE "room"
    ADD COLUMN "addressId" TEXT;

-- AddForeignKey: UserData.addressId -> Address
ALTER TABLE "UserData" ADD CONSTRAINT "UserData_addressId_fkey"
    FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: room.addressId -> Address
ALTER TABLE "room" ADD CONSTRAINT "room_addressId_fkey"
    FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: Property.userDataId -> UserData
ALTER TABLE "Property" ADD CONSTRAINT "Property_userDataId_fkey"
    FOREIGN KEY ("userDataId") REFERENCES "UserData"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: Property.addressId -> Address
ALTER TABLE "Property" ADD CONSTRAINT "Property_addressId_fkey"
    FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: UserRelation.sourceId -> UserData
ALTER TABLE "UserRelation" ADD CONSTRAINT "UserRelation_sourceId_fkey"
    FOREIGN KEY ("sourceId") REFERENCES "UserData"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: UserRelation.targetId -> UserData
ALTER TABLE "UserRelation" ADD CONSTRAINT "UserRelation_targetId_fkey"
    FOREIGN KEY ("targetId") REFERENCES "UserData"("id") ON DELETE CASCADE ON UPDATE CASCADE;
