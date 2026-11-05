-- Nº do lançamento único para sempre (decisão 005, ida B, passo 2).
--
-- Índice CHEIO, e não parcial: conta também os excluídos, para o número de um
-- lançamento excluído nunca voltar a ser usado (uma nota impressa não pode
-- passar a ter o número de outra). É o contrário do padrão do projeto para
-- soft-delete, de propósito. Os null (excluídos antes da numeração) não
-- colidem entre si.
--
-- Bate com o @unique do schema.prisma. Não toca em nenhum dado.
CREATE UNIQUE INDEX "FinancialTransaction_number_key" ON "FinancialTransaction"("number");
