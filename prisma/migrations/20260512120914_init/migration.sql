-- CreateEnum
CREATE TYPE "permitions" AS ENUM ('CREATE_USER', 'UPDATE_USER', 'DELETE_USER', 'READ_USER');

-- CreateTable
CREATE TABLE "UserAdmin" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userDataId" TEXT NOT NULL,
    "rulesId" TEXT NOT NULL,

    CONSTRAINT "UserAdmin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserData" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "permitions" "permitions"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserAdmin_username_key" ON "UserAdmin"("username");

-- CreateIndex
CREATE UNIQUE INDEX "UserAdmin_userDataId_key" ON "UserAdmin"("userDataId");

-- CreateIndex
CREATE UNIQUE INDEX "UserData_email_key" ON "UserData"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UserData_phone_key" ON "UserData"("phone");

-- AddForeignKey
ALTER TABLE "UserAdmin" ADD CONSTRAINT "UserAdmin_userDataId_fkey" FOREIGN KEY ("userDataId") REFERENCES "UserData"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAdmin" ADD CONSTRAINT "UserAdmin_rulesId_fkey" FOREIGN KEY ("rulesId") REFERENCES "Rule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
