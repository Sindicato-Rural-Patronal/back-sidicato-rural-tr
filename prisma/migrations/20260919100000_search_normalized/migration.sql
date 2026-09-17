-- Busca sem acento e CPF só com dígitos.
--
-- 1) immutable_unaccent_lower: minúsculo e sem acento, em SQL puro (sem a
--    extensão unaccent). Troca maiúsculas e minúsculas acentuadas antes do
--    lower(), então funciona mesmo com LC_CTYPE "C". Mesma regra do
--    searchKey() em src/adapter/database/list-filters.ts.
CREATE OR REPLACE FUNCTION immutable_unaccent_lower(text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
AS $$
    SELECT pg_catalog.lower(pg_catalog.translate(
        $1,
        'áàâãäåéèêëíìîïóòôõöúùûüçñýÿÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝŸ',
        'aaaaaaeeeeiiiiooooouuuucnyyAAAAAAEEEEIIIIOOOOOUUUUCNYY'
    ))
$$;

-- 2) Colunas de busca, preenchidas por trigger em todo INSERT/UPDATE. A aplicação
--    nunca grava nelas (se gravar, o trigger sobrescreve). Trigger em vez de
--    coluna GENERATED: o Prisma lê a expressão da coluna gerada como default e o
--    `migrate dev` passaria a acusar diferença com o schema.prisma.
ALTER TABLE "UserData" ADD COLUMN IF NOT EXISTS "nameSearch" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "nameSearch" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "tradeNameSearch" TEXT;

CREATE OR REPLACE FUNCTION "UserData_fill_search"() RETURNS trigger
LANGUAGE plpgsql SET search_path FROM CURRENT
AS $$
BEGIN
    NEW."nameSearch" := immutable_unaccent_lower(NEW."name");
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "Company_fill_search"() RETURNS trigger
LANGUAGE plpgsql SET search_path FROM CURRENT
AS $$
BEGIN
    NEW."nameSearch" := immutable_unaccent_lower(NEW."name");
    NEW."tradeNameSearch" := immutable_unaccent_lower(NEW."tradeName");
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "UserData_fill_search" ON "UserData";
CREATE TRIGGER "UserData_fill_search"
BEFORE INSERT OR UPDATE ON "UserData"
FOR EACH ROW EXECUTE FUNCTION "UserData_fill_search"();

DROP TRIGGER IF EXISTS "Company_fill_search" ON "Company";
CREATE TRIGGER "Company_fill_search"
BEFORE INSERT OR UPDATE ON "Company"
FOR EACH ROW EXECUTE FUNCTION "Company_fill_search"();

-- 3) CPF só com dígitos; vazio (ou sem nenhum dígito) vira NULL. O índice único
--    "UserData_cpf_active_unique" já compara regexp_replace(cpf, '\D', '', 'g'),
--    então a chave de uma linha ativa não muda ao tirar a máscara. O NOT EXISTS
--    é trava extra: se mesmo assim houver outra linha ativa com os mesmos
--    dígitos, a linha fica como está e a migração não falha.
UPDATE "UserData" u
SET "cpf" = NULLIF(regexp_replace(u."cpf", '\D', '', 'g'), '')
WHERE u."cpf" IS NOT NULL
  AND u."cpf" IS DISTINCT FROM NULLIF(regexp_replace(u."cpf", '\D', '', 'g'), '')
  AND (
        u."isDeleted" = true
     OR regexp_replace(u."cpf", '\D', '', 'g') = ''
     OR NOT EXISTS (
            SELECT 1 FROM "UserData" o
            WHERE o."id" <> u."id"
              AND o."isDeleted" = false
              AND o."cpf" IS NOT NULL
              AND regexp_replace(o."cpf", '\D', '', 'g') = regexp_replace(u."cpf", '\D', '', 'g')
        )
  );

-- 4) Preenche as colunas de busca das linhas que já existem.
UPDATE "UserData" SET "nameSearch" = immutable_unaccent_lower("name");
UPDATE "Company"
SET "nameSearch" = immutable_unaccent_lower("name"),
    "tradeNameSearch" = immutable_unaccent_lower("tradeName");
