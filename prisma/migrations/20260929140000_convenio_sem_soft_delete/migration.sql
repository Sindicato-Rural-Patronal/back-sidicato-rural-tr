-- Convênio nunca teve exclusão lógica: DeleteConvenioUseCase apaga a linha de
-- verdade, e estas três colunas jamais foram lidas nem escritas por nada no
-- código. Ficavam ali como armadilha: quem resolvesse "ativar" o soft-delete
-- veria as colunas prontas e não a parte difícil — o `slug` é @unique cheio,
-- então um convênio excluído seguraria o slug para sempre e não daria para
-- recadastrar (o mesmo problema que travava as salas).
--
-- Todas as linhas têm isDeleted = false, deletedAt = null e createdBy = null,
-- então não há dado a perder. Se algum dia o soft-delete fizer sentido aqui, o
-- caminho é: colunas de volta + trocar o @unique do slug por índice parcial
-- (WHERE "isDeleted" = false) + filtrar isDeleted em findBySlug/findAll/listMenu.
ALTER TABLE "Convenio" DROP COLUMN "isDeleted";
ALTER TABLE "Convenio" DROP COLUMN "deletedAt";
ALTER TABLE "Convenio" DROP COLUMN "createdBy";
