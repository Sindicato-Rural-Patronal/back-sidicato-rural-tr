-- Nº de identificação dos lançamentos do Financeiro (decisão 005, ida A, passo 1).
--
-- Só acrescenta a coluna, vazia: sem default, sem NOT NULL e sem índice. Não
-- toca em nenhum dado. A numeração dos lançamentos que já existem vem na
-- migration seguinte (..._finance_transaction_number_fill), e o índice único
-- só na ida B.
ALTER TABLE "FinancialTransaction" ADD COLUMN "number" INTEGER;
