-- Dados da Nota de Empenho por lançamento (fornecedor, NF, banco, desconto).
ALTER TABLE "FinancialTransaction" ADD COLUMN "empenho" JSONB;
