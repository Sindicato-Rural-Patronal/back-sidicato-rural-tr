-- Visões da tela (decisão 007, SR-149): a visão da equipe guarda, além das
-- colunas, os filtros que liga (ex.: Tipo Entradas, Sem transferências entre
-- caixas, Período mês passado). Só acrescenta: uma coluna nova, que aceita
-- nulo, sem DEFAULT e sem UPDATE. Nenhuma linha que já existe muda; os modelos
-- já salvos ficam com "filters" nulo (aplicam só as colunas).

-- AlterTable
ALTER TABLE "ReportTemplate" ADD COLUMN "filters" JSONB;
