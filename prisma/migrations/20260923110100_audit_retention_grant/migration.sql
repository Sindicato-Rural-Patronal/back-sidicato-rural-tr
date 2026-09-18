-- Quem já enxerga a trilha passa a poder configurá-la (tempo de guarda), para o
-- gestor de hoje continuar funcionando sem mexer nas regras à mão. Idempotente.
UPDATE "Rule"
SET "permissions" = array_append("permissions", 'UPDATE_AUDIT'::"Permission"),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE 'READ_AUDIT' = ANY("permissions")
  AND NOT ('UPDATE_AUDIT' = ANY("permissions"));

-- Padrão da guarda: 0 = guardar para sempre (comportamento atual). Só cria se
-- ainda não existir, para não sobrescrever uma escolha já feita no painel.
INSERT INTO "SiteSetting" ("key", "value", "updatedAt")
VALUES ('audit.retentionDays', '0', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
