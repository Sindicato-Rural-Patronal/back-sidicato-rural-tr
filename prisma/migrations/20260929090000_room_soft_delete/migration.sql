-- Salas passam a ser excluídas por soft-delete.
--
-- Antes, remover uma sala era um DELETE de verdade, e a chave estrangeira
-- course.roomId (obrigatória, sem cascade) travava qualquer sala que algum dia
-- tivesse sido usada num curso — inclusive num curso de anos atrás, ou num
-- curso já excluído. Na prática, sala usada uma vez nunca mais saía da lista.
--
-- Com o soft-delete o curso antigo continua apontando para a sala (o histórico
-- e a agenda antiga seguem inteiros) e a sala some das listas e dos selects.
ALTER TABLE "room" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "room" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Nome único entre as salas ATIVAS: excluir "SALA 1" e cadastrar "SALA 1" de
-- novo precisa funcionar. Índice parcial, igual ao das inscrições ativas.
CREATE UNIQUE INDEX "room_name_active_key" ON "room" ("name") WHERE "isDeleted" = false;
