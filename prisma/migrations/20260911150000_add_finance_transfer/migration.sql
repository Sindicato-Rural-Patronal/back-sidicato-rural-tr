-- AlterTable
ALTER TABLE "FinancialTransaction" ADD COLUMN "transferId" TEXT;

-- CreateIndex
CREATE INDEX "FinancialTransaction_transferId_idx" ON "FinancialTransaction"("transferId");
