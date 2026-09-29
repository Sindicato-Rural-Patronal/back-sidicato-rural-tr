-- UserInstructor ganha as colunas de soft-delete DE VERDADE.
--
-- O schema.prisma as declarava desde sempre, mas a migração que espalhou o
-- soft-delete (20260615000000_add_soft_delete) não incluiu esta tabela, e
-- nenhuma outra as acrescentou: elas existiam só no schema. Como nada no
-- código as lia, ninguém notou — até "remover instrutor" passar a marcar em
-- vez de apagar, que é o que exige a coluna existir.
--
-- O DELETE que havia antes não funcionava: CourseInstructor.instructorId é FK
-- obrigatória sem cascade, então quem já tinha dado qualquer curso não podia
-- ser removido. O erro morria num catch mudo e a rota respondia 200.
--
-- O IF NOT EXISTS é por segurança: se algum ambiente tiver ganhado as colunas
-- à mão, a migração passa sem reclamar.
ALTER TABLE "UserInstructor" ADD COLUMN IF NOT EXISTS "isDeleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "UserInstructor" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
