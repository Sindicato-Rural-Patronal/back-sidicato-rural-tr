-- 1) Contatos públicos ("Nossa Equipe") viram tabela própria: qualquer pessoa do
--    cadastro, com ordem. Antes eram administradores com isPublic/publicTitle.
CREATE TABLE "PublicContact" (
    "id" TEXT NOT NULL,
    "userDataId" TEXT NOT NULL,
    "title" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicContact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PublicContact_userDataId_key" ON "PublicContact"("userDataId");

ALTER TABLE "PublicContact" ADD CONSTRAINT "PublicContact_userDataId_fkey"
    FOREIGN KEY ("userDataId") REFERENCES "UserData"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Leva os contatos atuais, na ordem em que aparecem hoje (alfabética).
INSERT INTO "PublicContact" ("id", "userDataId", "title", "order", "updatedAt")
SELECT gen_random_uuid()::text, a."userDataId", NULLIF(btrim(a."publicTitle"), ''),
       (ROW_NUMBER() OVER (ORDER BY u."name") - 1)::int, CURRENT_TIMESTAMP
FROM "UserAdmin" a
JOIN "UserData" u ON u."id" = a."userDataId"
WHERE a."isPublic" = true AND a."isDeleted" = false AND u."isDeleted" = false;

ALTER TABLE "UserAdmin" DROP COLUMN "isPublic",
DROP COLUMN "publicTitle";

-- 2) Tipo de membro fora da lista fixa (ex.: "SOCIO"): o valor vai para as
--    observações do associado e o campo fica vazio.
UPDATE "UserData"
SET "memberNotes" = concat_ws(E'\n', NULLIF("memberNotes", ''), 'Tipo de membro antigo: ' || "memberType"),
    "memberType" = NULL
WHERE "memberType" IS NOT NULL
  AND "memberType" NOT IN ('ALUNO', 'PRODUTOR RURAL', 'TRABALHADOR RURAL ASSALARIADO', 'TRABALHADOR RURAL AUTONOMO');

-- 3) Colunas antigas do cadastro de pessoa (empresa/parceria viraram Company).
--    CNPJ que ainda estiver preenchido vai para as observações antes de sair.
UPDATE "UserData"
SET "memberNotes" = concat_ws(E'\n', NULLIF("memberNotes", ''), 'CNPJ (cadastro antigo): ' || "cnpj")
WHERE NULLIF(btrim("cnpj"), '') IS NOT NULL;

ALTER TABLE "UserData" DROP COLUMN "cnpj",
DROP COLUMN "isPartner",
DROP COLUMN "partnerLogo",
DROP COLUMN "partnerOrder",
DROP COLUMN "partnerUrl";

-- 4) Dados do sindicato editáveis em Configurações do site (antes fixos no
--    código do site). Só cria se ainda não existir.
INSERT INTO "SiteSetting" ("key", "value", "updatedAt") VALUES
    ('org.phone', '(44) 3645-1200', CURRENT_TIMESTAMP),
    ('org.email', 'contato@sindicatoruraltr.com.br', CURRENT_TIMESTAMP),
    ('org.street', 'Rua Sete de Setembro, 1847', CURRENT_TIMESTAMP),
    ('org.district', 'Centro', CURRENT_TIMESTAMP),
    ('org.city', 'Terra Roxa', CURRENT_TIMESTAMP),
    ('org.state', 'PR', CURRENT_TIMESTAMP),
    ('org.zip', '85990-000', CURRENT_TIMESTAMP),
    ('org.hours', E'Segunda a Sexta: 08h às 17h\nSábado: 08h às 12h', CURRENT_TIMESTAMP),
    ('org.mapQuery', 'Sindicato Rural de Terra Roxa PR Brasil', CURRENT_TIMESTAMP),
    ('quotes.source', 'Cvale', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
