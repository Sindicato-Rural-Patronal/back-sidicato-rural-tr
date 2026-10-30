-- Numera os lançamentos ativos ainda sem número, em ordem de data
-- (decisão 005, ida A, passo 2).
--
-- UPDATE em massa, mas só na coluna "number", criada vazia na migration
-- anterior. Nenhum valor, data, descrição ou JSON existente é tocado.
-- Pode rodar de novo: só pega quem ainda está sem número e continua do maior.
-- Os excluídos ficam sem número (decisão 005, item 6).
--
-- Ordem: "date"; depois o "createdAt"; no empate, saída e "só nota" antes da
-- entrada; por fim o id, para o resultado ser sempre o mesmo.
--
-- Transferência: as duas pernas ficam juntas, a saída e logo depois a entrada,
-- na posição do "createdAt" da SAÍDA. A decisão supunha as duas pernas com o
-- mesmo "createdAt", mas o Prisma gera o horário a cada gravação: a entrada sai
-- alguns milissegundos depois da saída (conferido em 30/10). Ordenando cada
-- perna pelo próprio "createdAt", um lançamento do mesmo dia gravado nesse
-- intervalo, ou empatado com a saída, cairia entre as duas.
WITH base AS (
  SELECT COALESCE(MAX("number"), 0) AS ultimo FROM "FinancialTransaction"
), pendentes AS (
  SELECT id,
         "date",
         "type",
         "transferId",
         CASE
           WHEN "transferId" IS NULL THEN "createdAt"
           ELSE COALESCE(
             MIN("createdAt") FILTER (WHERE "type" = 'OUT') OVER (PARTITION BY "transferId"),
             "createdAt"
           )
         END AS criado
  FROM "FinancialTransaction"
  WHERE "number" IS NULL AND NOT "isDeleted"
), ordem AS (
  SELECT id,
         ROW_NUMBER() OVER (
           ORDER BY "date",
                    criado,
                    -- a transferência entra no empate como saída (começa por ela)
                    ("transferId" IS NULL AND "type" IS NOT DISTINCT FROM 'IN'),
                    -- as duas pernas de uma transferência juntas
                    COALESCE("transferId", id),
                    ("type" IS NOT DISTINCT FROM 'IN'),
                    id
         ) AS n
  FROM pendentes
)
UPDATE "FinancialTransaction" t
SET "number" = base.ultimo + ordem.n
FROM ordem, base
WHERE t.id = ordem.id;
