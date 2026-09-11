-- CreateTable
CREATE TABLE "FinancialAttachment" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinancialAttachment_transactionId_idx" ON "FinancialAttachment"("transactionId");

-- AddForeignKey
ALTER TABLE "FinancialAttachment" ADD CONSTRAINT "FinancialAttachment_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "FinancialTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
