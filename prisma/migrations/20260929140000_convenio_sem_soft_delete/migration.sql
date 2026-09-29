-- Convênio nunca teve exclusão lógica: DeleteConvenioUseCase apaga a linha de
-- verdade. E as colunas isDeleted/deletedAt/createdBy que o schema.prisma
-- declarava **nunca chegaram ao banco** — a migração que criou a tabela
-- (20260916120000_convenio) não as tem, e nenhuma outra as acrescentou. Como
-- nada no código lia nem escrevia nelas, o desencontro entre o schema e o
-- banco passou meses sem aparecer.
--
-- Esta migração tira as colunas do schema e, se em algum ambiente elas tiverem
-- sido criadas à mão, do banco também. O IF EXISTS é o que faz ela funcionar
-- nos dois casos: banco novo (nunca teve) e banco que porventura tenha.
--
-- Se algum dia o soft-delete fizer sentido aqui, o caminho é: colunas de volta
-- POR MIGRAÇÃO + trocar o @unique do slug por índice parcial
-- (WHERE "isDeleted" = false) + filtrar isDeleted em findBySlug/findAll/listMenu.
-- Sem a segunda parte, o convênio excluído segura o slug para sempre e não dá
-- para recadastrar — o mesmo problema que travava as salas.
ALTER TABLE "Convenio" DROP COLUMN IF EXISTS "isDeleted";
ALTER TABLE "Convenio" DROP COLUMN IF EXISTS "deletedAt";
ALTER TABLE "Convenio" DROP COLUMN IF EXISTS "createdBy";
