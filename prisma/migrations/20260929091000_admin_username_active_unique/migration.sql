-- O usuário de um administrador excluído ficava preso para sempre: o unique de
-- "username" conta também as linhas soft-deletadas, então cadastrar de novo
-- alguém com o mesmo usuário respondia "já existe" apontando para um
-- administrador que não aparece em lugar nenhum — sem saída pelo painel.
--
-- Passa a valer entre os administradores ATIVOS, como já era nas inscrições
-- (índice parcial; não dá para escrever como @unique no schema do Prisma).
DROP INDEX "UserAdmin_username_key";

CREATE UNIQUE INDEX "UserAdmin_username_active_key"
    ON "UserAdmin" ("username")
    WHERE "isDeleted" = false;
