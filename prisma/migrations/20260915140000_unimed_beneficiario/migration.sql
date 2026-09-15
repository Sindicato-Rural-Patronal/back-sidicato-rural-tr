-- Convênio Unimed: extensão 1:1 do UserData com os campos específicos do convênio.
CREATE TABLE "UnimedBeneficiario" (
    "id" TEXT NOT NULL,
    "userDataId" TEXT NOT NULL,
    "dataAdesao" TIMESTAMP(3),
    "tipoMovimento" TEXT,
    "tipoDependente" TEXT,
    "grauDependencia" TEXT,
    "cns" TEXT,
    "nomeMae" TEXT,
    "profissao" TEXT,
    "plano" TEXT,
    "matricula" TEXT,
    "empresa" TEXT,
    "contratante" TEXT,
    "titularId" TEXT,
    "motivo" TEXT,
    "obs" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UnimedBeneficiario_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UnimedBeneficiario_userDataId_key" ON "UnimedBeneficiario"("userDataId");
CREATE INDEX "UnimedBeneficiario_titularId_idx" ON "UnimedBeneficiario"("titularId");

ALTER TABLE "UnimedBeneficiario"
    ADD CONSTRAINT "UnimedBeneficiario_userDataId_fkey"
    FOREIGN KEY ("userDataId") REFERENCES "UserData"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
