-- Um lançamento por produto/dia/período. Duplicatas (dois salvamentos ao mesmo
-- tempo) ficam só com a mais recente antes de criar o índice.
DELETE FROM "MarketQuoteHistory" h
USING "MarketQuoteHistory" d
WHERE h."marketQuoteId" = d."marketQuoteId"
  AND h."referenceDate" = d."referenceDate"
  AND h."period" = d."period"
  AND (h."createdAt", h."id") < (d."createdAt", d."id");

CREATE UNIQUE INDEX "MarketQuoteHistory_marketQuoteId_referenceDate_period_key"
ON "MarketQuoteHistory"("marketQuoteId", "referenceDate", "period");
