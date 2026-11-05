-- Numera de novo os lançamentos ativos ainda sem número (decisão 005, ida B,
-- passo 1): os criados entre a ida A e a ida B, porque o código da ida A ainda
-- não dava número. Eles continuam do maior.
--
-- É a mesma consulta de ..._finance_transaction_number_fill. Só escreve na
-- coluna "number" e só nas linhas em que ela está vazia; com tudo já numerado,
-- não muda nada. Roda antes do índice único (..._finance_transaction_number_unique).
--
-- Ordem: "date"; depois o "createdAt"; no empate, saída e "só nota" antes da
-- entrada; por fim o id. As duas pernas de uma transferência ficam juntas, a
-- saída e logo depois a entrada, na posição do "createdAt" da saída.
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
