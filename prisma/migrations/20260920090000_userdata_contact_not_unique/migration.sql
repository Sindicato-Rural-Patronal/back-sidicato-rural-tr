-- E-mail e telefone podem repetir entre pessoas (casal, pais e filhos usam o
-- mesmo contato) e o e-mail passa a ser opcional. A identidade continua sendo o
-- CPF (índice parcial "UserData_cpf_active_unique", migração 20260914120000).
DROP INDEX IF EXISTS "UserData_email_key";
DROP INDEX IF EXISTS "UserData_phone_key";

ALTER TABLE "UserData" ALTER COLUMN "email" DROP NOT NULL;

-- E-mail em branco vira "sem e-mail" (a aplicação grava vazio como null).
UPDATE "UserData" SET "email" = NULL WHERE btrim("email") = '';
