-- Modelos de relatório salvos pela equipe (decisão 006, fase 3, SR-114): o
-- montador de relatórios passa a guardar as colunas que alguém montou, para a
-- equipe toda reaproveitar. Só acrescenta: uma tabela nova, sem FK, e um
-- índice nela. Nenhuma tabela ou dado que já existe muda.

-- CreateTable
CREATE TABLE "ReportTemplate" (
    "id" TEXT NOT NULL,
    "dataset" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fields" TEXT[],
    "format" TEXT,
    "confirmed" BOOLEAN,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportTemplate_pkey" PRIMARY KEY ("id")
);

-- Nome único por conjunto entre os modelos ATIVOS, sem diferenciar maiúsculas
-- ("Contato" e "contato" são o mesmo nome): excluir um modelo libera o nome,
-- como o CPF e o nome da sala. Índice parcial não se escreve no schema do
-- Prisma. Ele também atende a listagem, que é por conjunto e só dos ativos.
CREATE UNIQUE INDEX "ReportTemplate_dataset_name_active_key"
    ON "ReportTemplate" ("dataset", lower("name"))
    WHERE "isDeleted" = false;
