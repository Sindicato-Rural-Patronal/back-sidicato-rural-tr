-- Convênios oferecidos aos associados (Unimed, …): cada convênio ativo vira uma
-- página pública em /convenios/:slug, com conteúdo editável no admin.
CREATE TABLE "Convenio" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "intro" TEXT,
    "logoUrl" TEXT,
    "priceLabelHeader" TEXT NOT NULL DEFAULT 'Faixa etária',
    "priceValueHeader" TEXT NOT NULL DEFAULT 'Valor sindicato',
    "priceRows" JSONB NOT NULL DEFAULT '[]',
    "priceNote" TEXT,
    "documentsTitle" TEXT NOT NULL DEFAULT 'Documentos para adesão',
    "documents" JSONB NOT NULL DEFAULT '[]',
    "highlightsTitle" TEXT,
    "highlights" JSONB NOT NULL DEFAULT '[]',
    "aboutTitle" TEXT,
    "aboutText" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Convenio_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Convenio_slug_key" ON "Convenio"("slug");
