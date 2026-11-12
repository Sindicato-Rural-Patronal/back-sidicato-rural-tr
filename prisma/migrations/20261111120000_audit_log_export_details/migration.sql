-- Auditoria: o que foi exportado (decisão 006, SR-088): { formato, modelo,
-- campos, escopo, filtros, linhas }. Só acrescenta uma coluna que aceita vazio:
-- as linhas antigas ficam com null e nenhum dado existente muda.
ALTER TABLE "AuditLog" ADD COLUMN "details" JSONB;
