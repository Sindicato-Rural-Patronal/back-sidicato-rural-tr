-- Permite lançamento "só nota" (sem entrada/saída): type passa a aceitar NULL.
ALTER TABLE "FinancialTransaction" ALTER COLUMN "type" DROP NOT NULL;
