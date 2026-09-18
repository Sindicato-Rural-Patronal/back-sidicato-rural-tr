-- Preferências do Painel Geral por administrador (cartões escondidos, ordem,
-- filtro do calendário…). Coluna opcional: nada é apagado e o valor antigo
-- (NULL) significa "usar o padrão do painel".
ALTER TABLE "UserAdmin" ADD COLUMN IF NOT EXISTS "dashboardPrefs" JSONB;
