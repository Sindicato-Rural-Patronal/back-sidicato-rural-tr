-- Empresas separadas do cadastro de pessoas.
-- Antes: empresa = um UserData com CNPJ; parceria = flags no UserData.
-- Agora: Company (com vínculos a várias pessoas via CompanyMember, cada uma com
-- título) e Property podendo pertencer a uma pessoa OU a uma empresa.

-- CreateEnum
CREATE TYPE "CompanyType" AS ENUM ('PRIVATE', 'PUBLIC');

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cnpj" TEXT,
    "stateRegistration" TEXT,
    "type" "CompanyType" NOT NULL DEFAULT 'PRIVATE',
    "phone" TEXT,
    "phone2" TEXT,
    "phone3" TEXT,
    "email" TEXT,
    "website" TEXT,
    "notes" TEXT,
    "isPartner" BOOLEAN NOT NULL DEFAULT false,
    "partnerUrl" TEXT,
    "partnerLogo" TEXT,
    "partnerOrder" INTEGER,
    "primaryPropertyId" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CNPJ único entre empresas ATIVAS, comparando só os dígitos (mesmo padrão do CPF).
CREATE UNIQUE INDEX "Company_cnpj_active_unique"
    ON "Company" ((regexp_replace("cnpj", '\D', '', 'g')))
    WHERE "isDeleted" = false AND "cnpj" IS NOT NULL;

-- CreateTable
CREATE TABLE "CompanyMember" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userDataId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyMember_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CompanyMember_userDataId_idx" ON "CompanyMember"("userDataId");
CREATE UNIQUE INDEX "CompanyMember_companyId_userDataId_key" ON "CompanyMember"("companyId", "userDataId");

ALTER TABLE "CompanyMember" ADD CONSTRAINT "CompanyMember_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyMember" ADD CONSTRAINT "CompanyMember_userDataId_fkey"
    FOREIGN KEY ("userDataId") REFERENCES "UserData"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Property: dona é uma pessoa OU uma empresa (nunca as duas, nunca nenhuma).
ALTER TABLE "Property" ADD COLUMN "companyId" TEXT,
ALTER COLUMN "userDataId" DROP NOT NULL;

CREATE INDEX "Property_companyId_idx" ON "Property"("companyId");

ALTER TABLE "Property" ADD CONSTRAINT "Property_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Property" ADD CONSTRAINT "Property_single_owner"
    CHECK (("userDataId" IS NULL) <> ("companyId" IS NULL));

-- Dados: cada pessoa ativa marcada como parceira ou com CNPJ vira uma empresa com
-- os mesmos dados de parceria, e a pessoa fica vinculada a ela como "RESPONSAVEL".
-- Nada é apagado de UserData (as colunas antigas ficam, só deixam de ser usadas).
-- CNPJ repetido entre pessoas: só a primeira empresa (por data de criação) leva o
-- CNPJ, pra não violar o índice único acima.
-- Um único comando (CTE): o Prisma não roda a migration numa transação única,
-- então nada de tabela temporária entre comandos. `MATERIALIZED` garante que o
-- gen_random_uuid() de cada linha seja o mesmo nos dois INSERTs.
WITH "src" AS MATERIALIZED (
    SELECT
        gen_random_uuid()::text AS "companyId",
        u."id"                  AS "userDataId",
        u."name",
        CASE
            WHEN NULLIF(regexp_replace(COALESCE(u."cnpj", ''), '\D', '', 'g'), '') IS NULL THEN NULL
            WHEN ROW_NUMBER() OVER (
                PARTITION BY NULLIF(regexp_replace(COALESCE(u."cnpj", ''), '\D', '', 'g'), '')
                ORDER BY u."createdAt"
            ) = 1 THEN regexp_replace(u."cnpj", '\D', '', 'g')
            ELSE NULL
        END                     AS "cnpj",
        u."email",
        u."isPartner",
        u."partnerUrl",
        u."partnerLogo",
        u."partnerOrder"
    FROM "UserData" u
    WHERE u."isDeleted" = false
      AND (u."isPartner" = true OR NULLIF(regexp_replace(COALESCE(u."cnpj", ''), '\D', '', 'g'), '') IS NOT NULL)
),
"newCompanies" AS (
    INSERT INTO "Company" (
        "id", "name", "cnpj", "type", "email",
        "isPartner", "partnerUrl", "partnerLogo", "partnerOrder",
        "notes", "updatedAt"
    )
    SELECT
        "companyId", "name", "cnpj", 'PRIVATE', "email",
        "isPartner", "partnerUrl", "partnerLogo", "partnerOrder",
        'Criada automaticamente a partir do cadastro de pessoa na separação de empresas.',
        CURRENT_TIMESTAMP
    FROM "src"
    RETURNING "id"
)
INSERT INTO "CompanyMember" ("id", "companyId", "userDataId", "title", "updatedAt")
SELECT gen_random_uuid()::text, "src"."companyId", "src"."userDataId", 'RESPONSAVEL', CURRENT_TIMESTAMP
FROM "src"
JOIN "newCompanies" ON "newCompanies"."id" = "src"."companyId";
