-- Garante um único cadastro ATIVO por CPF, comparando só os dígitos
-- (ignora máscara/formatação) e ignorando linhas soft-deletadas.
-- Índice parcial + expressão: não expressável no schema.prisma, gerido só aqui.
CREATE UNIQUE INDEX IF NOT EXISTS "UserData_cpf_active_unique"
ON "UserData" ((regexp_replace("cpf", '\D', '', 'g')))
WHERE "isDeleted" = false AND "cpf" IS NOT NULL;
