-- CreateEnum
CREATE TYPE "FinancialType" AS ENUM ('IN', 'OUT');

-- CreateTable
CREATE TABLE "FinancialCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "FinancialType" NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#64748b',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialTransaction" (
    "id" TEXT NOT NULL,
    "type" "FinancialType" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "method" TEXT,
    "notes" TEXT,
    "categoryId" TEXT,
    "createdBy" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinancialTransaction_date_idx" ON "FinancialTransaction"("date");

-- CreateIndex
CREATE INDEX "FinancialTransaction_type_idx" ON "FinancialTransaction"("type");

-- CreateIndex
CREATE INDEX "FinancialTransaction_categoryId_idx" ON "FinancialTransaction"("categoryId");

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FinancialCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed inicial de categorias (cadastráveis depois no painel).
INSERT INTO "FinancialCategory" ("id", "name", "type", "color", "order", "updatedAt") VALUES
    (gen_random_uuid(), 'Mensalidade',    'IN',  '#16a34a', 1, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Curso/SENAR',    'IN',  '#0891b2', 2, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Doação',         'IN',  '#7c3aed', 3, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Outros (entrada)','IN', '#64748b', 4, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Salário',        'OUT', '#dc2626', 5, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Material',       'OUT', '#ea580c', 6, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Serviços',       'OUT', '#d97706', 7, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Impostos/Taxas', 'OUT', '#b91c1c', 8, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Outros (saída)', 'OUT', '#64748b', 9, CURRENT_TIMESTAMP);
