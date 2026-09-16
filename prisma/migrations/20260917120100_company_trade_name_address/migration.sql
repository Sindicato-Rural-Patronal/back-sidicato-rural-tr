-- Empresa: nome fantasia (o "name" existente passa a ser a razão social) e
-- endereço da sede (CEP, rua, número, bairro, cidade...) direto no cadastro.
ALTER TABLE "Company" ADD COLUMN "tradeName" TEXT,
ADD COLUMN "addressId" TEXT;

ALTER TABLE "Company" ADD CONSTRAINT "Company_addressId_fkey"
    FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;
