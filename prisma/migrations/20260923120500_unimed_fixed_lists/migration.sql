-- Unimed: tipo de movimento e grau de dependência viraram lista fixa no painel e
-- o CNS passou a ser gravado só com dígitos. Nada de esquema muda aqui — só a
-- arrumação dos dados existentes, sem perder valor nenhum:
--   • maiúsculas/espaços: só onde o texto já é, letra por letra, um item da lista
--     (ex.: "titular" → "TITULAR"). Texto antigo fora da lista fica como está e o
--     painel o mostra como "(valor antigo)".
--   • CNS: tira a máscara apenas quando sobram exatamente 15 dígitos.

UPDATE "UnimedBeneficiario"
SET "grauDependencia" = upper(btrim("grauDependencia"))
WHERE "grauDependencia" IS NOT NULL
  AND "grauDependencia" <> upper(btrim("grauDependencia"))
  AND upper(btrim("grauDependencia")) IN ('TITULAR', 'CONJUGE', 'FILHO(A)', 'ENTEADO(A)', 'PAI/MAE', 'OUTRO');

UPDATE "UnimedBeneficiario"
SET "tipoMovimento" = upper(btrim("tipoMovimento"))
WHERE "tipoMovimento" IS NOT NULL
  AND "tipoMovimento" <> upper(btrim("tipoMovimento"))
  AND upper(btrim("tipoMovimento")) IN (
    'INCLUSAO DE TITULAR', 'INCLUSAO DE DEPENDENTE', 'EXCLUSAO DE TITULAR',
    'EXCLUSAO DE DEPENDENTE', 'ALTERACAO CADASTRAL', 'REATIVACAO'
  );

UPDATE "UnimedBeneficiario"
SET "cns" = regexp_replace("cns", '\D', '', 'g')
WHERE "cns" IS NOT NULL
  AND "cns" <> regexp_replace("cns", '\D', '', 'g')
  AND length(regexp_replace("cns", '\D', '', 'g')) = 15;
