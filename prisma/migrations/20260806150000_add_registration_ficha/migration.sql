-- CreateTable
CREATE TABLE "registrationFicha" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "registrationFicha_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "registrationFicha_registrationId_key" ON "registrationFicha"("registrationId");

-- AddForeignKey
ALTER TABLE "registrationFicha" ADD CONSTRAINT "registrationFicha_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "courseUserRegistration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
