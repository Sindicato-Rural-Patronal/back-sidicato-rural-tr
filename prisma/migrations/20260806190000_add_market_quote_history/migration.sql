-- CreateTable
CREATE TABLE "MarketQuoteHistory" (
    "id" TEXT NOT NULL,
    "marketQuoteId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "numeric" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketQuoteHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketQuoteHistory_marketQuoteId_createdAt_idx" ON "MarketQuoteHistory"("marketQuoteId", "createdAt");

-- AddForeignKey
ALTER TABLE "MarketQuoteHistory" ADD CONSTRAINT "MarketQuoteHistory_marketQuoteId_fkey" FOREIGN KEY ("marketQuoteId") REFERENCES "MarketQuote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
