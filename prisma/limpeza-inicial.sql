-- ============================================================================
-- LIMPEZA PARA COMECAR O BANCO DO ZERO
--
-- Apaga TODOS os dados, menos o administrador escolhido (o login, a pessoa
-- dele e a regra de permissao dele). NAO ha desfazer: rode com o banco certo
-- em maos.
--
-- Como rodar: cole no SQL Editor do Supabase (ou `psql -f`), depois de
-- conferir o ADMIN abaixo.
--
-- O que SOBREVIVE, e por que:
--   * UserAdmin/UserData/Rule do admin  -> sem isso ninguem entra no painel.
--   * MarketQuote (as 5 linhas)         -> produto de cotacao e FIXO: o painel
--                                          so lanca preco, nao cria produto.
--                                          Apagar quebraria a tela sem volta,
--                                          entao aqui o preco e zerado e o
--                                          historico apagado.
--   * _prisma_migrations                -> apagar faria o deploy tentar rodar
--                                          tudo de novo.
--
-- O que NAO sobrevive (o painel recria): salas, categorias e caixas do
-- financeiro, formas de pagamento, convenios, galerias, banners, contatos
-- publicos, configuracoes do site.
-- ============================================================================

BEGIN;

-- Quem fica. Troque se o usuario for outro.
CREATE TEMP TABLE _admin_que_fica AS
SELECT a.id AS admin_id, a."userDataId" AS user_data_id, a."rulesId" AS rule_id
FROM "UserAdmin" a
WHERE a.username = 'bali';

-- Para o script nao esvaziar o banco e deixar voce sem acesso.
DO $$
BEGIN
    IF (SELECT count(*) FROM _admin_que_fica) <> 1 THEN
        RAISE EXCEPTION
            'Esperava exatamente 1 admin com esse username, achei %. Nada foi apagado.',
            (SELECT count(*) FROM _admin_que_fica);
    END IF;
END $$;

-- ── Cursos, inscricoes e agenda ─────────────────────────────────────────────
DELETE FROM "registrationFicha";
DELETE FROM "courseUserRegistration";
DELETE FROM "CoursePhoto";
DELETE FROM "CourseInstructor";
DELETE FROM "RoomBooking";
DELETE FROM "course";
DELETE FROM "room";

-- ── Financeiro ──────────────────────────────────────────────────────────────
DELETE FROM "FinancialAttachment";
DELETE FROM "FinancialTransaction";
DELETE FROM "FinanceRecurringTransaction";
DELETE FROM "FinanceMonthlyClosing";
DELETE FROM "FinancePaymentMethod";
DELETE FROM "FinancialCategory";
DELETE FROM "FinancialAccount";

-- ── Conteudo do site ────────────────────────────────────────────────────────
DELETE FROM "GalleryPhoto";
DELETE FROM "GalleryAlbum";
DELETE FROM "Convenio";
DELETE FROM "Banner";
DELETE FROM "News";
DELETE FROM "ContactMessage";
DELETE FROM "PublicContact";
DELETE FROM "SiteSetting";

-- ── Cotacoes: o produto fica, o preco e o historico vao ─────────────────────
DELETE FROM "MarketQuoteHistory";
UPDATE "MarketQuote"
SET "priceCents" = NULL,
    "value" = '',
    "period" = NULL,
    "variation" = NULL,
    "referenceDate" = NULL;

-- ── Avisos e trilha ─────────────────────────────────────────────────────────
DELETE FROM "NotificationRead";
DELETE FROM "Notification";
DELETE FROM "AuditLog";
DELETE FROM "AdminInvite";

-- ── Cadastros ───────────────────────────────────────────────────────────────
DELETE FROM "UnimedBeneficiario";
DELETE FROM "CompanyMember";
DELETE FROM "Company";
DELETE FROM "UserRelation";
DELETE FROM "UserInstructor";
DELETE FROM "Property";

-- Outros administradores saem; o escolhido fica.
DELETE FROM "UserAdmin"
WHERE id NOT IN (SELECT admin_id FROM _admin_que_fica);

DELETE FROM "Rule"
WHERE id NOT IN (SELECT rule_id FROM _admin_que_fica);

DELETE FROM "UserData"
WHERE id NOT IN (SELECT user_data_id FROM _admin_que_fica);

-- Endereco solto: o "Address" so faz sentido preso a alguem, e a essa altura
-- ninguem mais aponta para ele.
DELETE FROM "Address" a
WHERE NOT EXISTS (SELECT 1 FROM "UserData" u WHERE u."addressId" = a.id)
  AND NOT EXISTS (SELECT 1 FROM "Company" c WHERE c."addressId" = a.id)
  AND NOT EXISTS (SELECT 1 FROM "Property" p WHERE p."addressId" = a.id);

-- A regra que sobrou passa a ter acesso total: depois da limpeza so existe um
-- administrador, e ele precisa conseguir abrir tudo para reconstruir o resto.
UPDATE "Rule"
SET permissions = ARRAY(SELECT unnest(enum_range(NULL::"Permission")))
WHERE id IN (SELECT rule_id FROM _admin_que_fica);

-- Confira antes de confirmar.
SELECT 'admins' AS tabela, count(*) FROM "UserAdmin"
UNION ALL SELECT 'pessoas', count(*) FROM "UserData"
UNION ALL SELECT 'regras', count(*) FROM "Rule"
UNION ALL SELECT 'cursos', count(*) FROM "course"
UNION ALL SELECT 'empresas', count(*) FROM "Company"
UNION ALL SELECT 'lancamentos', count(*) FROM "FinancialTransaction"
UNION ALL SELECT 'produtos de cotacao', count(*) FROM "MarketQuote";

-- Conferiu? Troque por COMMIT.
ROLLBACK;
