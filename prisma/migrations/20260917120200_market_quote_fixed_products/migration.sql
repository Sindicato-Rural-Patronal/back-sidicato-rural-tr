-- Cotações com produtos FIXOS: SOJA, MILHO, TRIGO, MANDIOCA, DOLAR.
-- No painel só se lança o preço e o período (manhã/tarde); a data é a do dia.

CREATE TYPE "QuotePeriod" AS ENUM ('MORNING', 'AFTERNOON');

ALTER TABLE "MarketQuote" ADD COLUMN "period" "QuotePeriod",
ADD COLUMN "priceCents" INTEGER,
ADD COLUMN "unit" TEXT;

ALTER TABLE "MarketQuoteHistory" ADD COLUMN "period" "QuotePeriod",
ADD COLUMN "referenceDate" TIMESTAMP(3);

-- Rótulos normalizados (maiúsculas, sem acento no dólar).
UPDATE "MarketQuote" SET "label" = upper(btrim("label"));
UPDATE "MarketQuote" SET "label" = 'DOLAR' WHERE "label" IN ('DÓLAR', 'US$', 'DOLAR COMERCIAL', 'DÓLAR COMERCIAL');

-- O que não é um dos produtos fixos sai (o histórico vai junto, em cascata).
DELETE FROM "MarketQuote"
WHERE "label" NOT IN ('SOJA', 'MILHO', 'TRIGO', 'MANDIOCA', 'DOLAR');

-- Rótulo repetido: fica o cadastro mais antigo.
DELETE FROM "MarketQuote" m
USING "MarketQuote" o
WHERE m."label" = o."label"
  AND (m."createdAt", m."id") > (o."createdAt", o."id");

CREATE UNIQUE INDEX "MarketQuote_label_key" ON "MarketQuote"("label");

-- Preço em centavos a partir do texto antigo ("R$ 1.234,50 /sc 60kg" → 123450).
UPDATE "MarketQuote"
SET "priceCents" = round(
    replace(replace(substring("value" from '[0-9][0-9.]*,[0-9]+|[0-9]+'), '.', ''), ',', '.')::numeric * 100
)::int
WHERE substring("value" from '[0-9]') IS NOT NULL;

-- Cria os produtos que faltam (sem preço até o primeiro lançamento).
INSERT INTO "MarketQuote" ("id", "label", "value", "isActive", "order", "updatedAt")
SELECT gen_random_uuid()::text, p.label, '', true, 0, CURRENT_TIMESTAMP
FROM (VALUES ('SOJA'), ('MILHO'), ('TRIGO'), ('MANDIOCA'), ('DOLAR')) AS p(label)
ON CONFLICT ("label") DO NOTHING;

-- Unidade e ordem fixas de cada produto.
UPDATE "MarketQuote" SET
    "isActive" = true,
    "unit" = CASE "label"
        WHEN 'SOJA' THEN 'sc 60kg'
        WHEN 'MILHO' THEN 'sc 60kg'
        WHEN 'TRIGO' THEN 'sc 60kg'
        WHEN 'MANDIOCA' THEN 't'
        ELSE NULL
    END,
    "order" = CASE "label"
        WHEN 'SOJA' THEN 0
        WHEN 'MILHO' THEN 1
        WHEN 'TRIGO' THEN 2
        WHEN 'MANDIOCA' THEN 3
        ELSE 4
    END;
