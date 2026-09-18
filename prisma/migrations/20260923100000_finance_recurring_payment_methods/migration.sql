-- Financeiro: lançamentos recorrentes (item 50), formas de pagamento como lista
-- cadastrável (item 51) e fechamento/conferência mensal por caixa (item 52).
-- Escrita à mão e idempotente: pode rodar sobre o banco já em uso.

-- ── Recorrentes ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "FinanceRecurringTransaction" (
    "id" TEXT NOT NULL,
    "type" "FinancialType" NOT NULL,
    "description" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "dayOfMonth" INTEGER NOT NULL,
    "startMonth" TEXT NOT NULL,
    "endMonth" TEXT,
    "lastGeneratedMonth" TEXT,
    "paymentMethod" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "categoryId" TEXT,
    "accountId" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceRecurringTransaction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "FinanceRecurringTransaction_active_idx"
    ON "FinanceRecurringTransaction"("active");

DO $$ BEGIN
    ALTER TABLE "FinanceRecurringTransaction"
        ADD CONSTRAINT "FinanceRecurringTransaction_categoryId_fkey"
        FOREIGN KEY ("categoryId") REFERENCES "FinancialCategory"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "FinanceRecurringTransaction"
        ADD CONSTRAINT "FinanceRecurringTransaction_accountId_fkey"
        FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Lançamento gerado por uma recorrência: guarda a origem e o mês gerado.
ALTER TABLE "FinancialTransaction" ADD COLUMN IF NOT EXISTS "recurringId" TEXT;
ALTER TABLE "FinancialTransaction" ADD COLUMN IF NOT EXISTS "recurringMonth" TEXT;

-- Trava da idempotência: nunca dois lançamentos da mesma recorrência no mesmo mês.
-- (NULLs não colidem no Postgres, então lançamentos normais não são afetados.)
CREATE UNIQUE INDEX IF NOT EXISTS "FinancialTransaction_recurringId_recurringMonth_key"
    ON "FinancialTransaction"("recurringId", "recurringMonth");

DO $$ BEGIN
    ALTER TABLE "FinancialTransaction"
        ADD CONSTRAINT "FinancialTransaction_recurringId_fkey"
        FOREIGN KEY ("recurringId") REFERENCES "FinanceRecurringTransaction"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Formas de pagamento ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "FinancePaymentMethod" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancePaymentMethod_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FinancePaymentMethod_name_key"
    ON "FinancePaymentMethod"("name");

-- Semente 1: o que já existe nos lançamentos (em caixa alta, sem espaços).
INSERT INTO "FinancePaymentMethod" ("id", "name", "order", "updatedAt")
SELECT gen_random_uuid(), m."name", 100, CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT UPPER(TRIM("method")) AS "name"
    FROM "FinancialTransaction"
    WHERE "method" IS NOT NULL AND TRIM("method") <> ''
) m
ON CONFLICT ("name") DO NOTHING;

-- Semente 2: as formas usuais, se ainda não vieram dos lançamentos.
INSERT INTO "FinancePaymentMethod" ("id", "name", "order", "updatedAt")
SELECT gen_random_uuid(), v."name", v."ord", CURRENT_TIMESTAMP
FROM (VALUES
    ('PIX', 1),
    ('DINHEIRO', 2),
    ('CARTÃO', 3),
    ('BOLETO', 4),
    ('TRANSFERÊNCIA', 5),
    ('CHEQUE', 6)
) AS v("name", "ord")
ON CONFLICT ("name") DO NOTHING;

-- ── Fechamento mensal ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "FinanceMonthlyClosing" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "expectedBalanceCents" INTEGER NOT NULL,
    "countedBalanceCents" INTEGER NOT NULL,
    "differenceCents" INTEGER NOT NULL,
    "notes" TEXT,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedByAdminId" TEXT,

    CONSTRAINT "FinanceMonthlyClosing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FinanceMonthlyClosing_accountId_month_key"
    ON "FinanceMonthlyClosing"("accountId", "month");

CREATE INDEX IF NOT EXISTS "FinanceMonthlyClosing_month_idx"
    ON "FinanceMonthlyClosing"("month");

DO $$ BEGIN
    ALTER TABLE "FinanceMonthlyClosing"
        ADD CONSTRAINT "FinanceMonthlyClosing_accountId_fkey"
        FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
