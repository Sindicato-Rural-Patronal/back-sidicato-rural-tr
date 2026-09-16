-- Galerias de imagens da home, no lugar dos números (associados, cursos
-- realizados, anos de história, alunos formados).

CREATE TABLE "GalleryAlbum" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "linkUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GalleryAlbum_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GalleryPhoto" (
    "id" TEXT NOT NULL,
    "albumId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "caption" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GalleryPhoto_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GalleryPhoto_albumId_order_idx" ON "GalleryPhoto"("albumId", "order");

ALTER TABLE "GalleryPhoto" ADD CONSTRAINT "GalleryPhoto_albumId_fkey"
    FOREIGN KEY ("albumId") REFERENCES "GalleryAlbum"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- As três galerias pedidas já nascem criadas (vazias; só aparecem na home
-- depois que tiverem foto).
INSERT INTO "GalleryAlbum" ("id", "title", "description", "order", "updatedAt") VALUES
    (gen_random_uuid()::text, 'História do Sindicato', 'Momentos que marcaram a trajetória do Sindicato Rural de Terra Roxa.', 0, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'FAEP', 'Ações e parcerias com a Federação da Agricultura do Estado do Paraná.', 1, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'Patrulha Rural', 'Segurança no campo com a Patrulha Rural.', 2, CURRENT_TIMESTAMP);
