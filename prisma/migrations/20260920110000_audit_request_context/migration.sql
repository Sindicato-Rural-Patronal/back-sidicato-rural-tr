-- Auditoria: de onde veio cada ação (IP, navegador/aparelho, local aproximado do
-- IP) e o que mudou ([{ field, before, after }]). Colunas opcionais: as linhas
-- antigas ficam com null. Pode rodar de novo sem erro.
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "ip" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "userAgent" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "location" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "changes" JSONB;

-- Filtro "Filtrar por este IP" no painel.
CREATE INDEX IF NOT EXISTS "AuditLog_ip_idx" ON "AuditLog"("ip");
