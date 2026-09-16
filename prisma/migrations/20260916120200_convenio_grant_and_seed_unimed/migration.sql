-- 1) Quem já edita o conteúdo público do site (banners) passa a editar também as
--    páginas de convênio. Sem isso a tela nova não aparece para ninguém até alguém
--    marcar as permissões na regra manualmente. Idempotente.
UPDATE "Rule"
SET "permissions" = array_cat(
        "permissions",
        ARRAY['CREATE_CONVENIO', 'UPDATE_CONVENIO', 'DELETE_CONVENIO', 'READ_CONVENIO']::"Permission"[]
    ),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE 'UPDATE_BANNER' = ANY("permissions")
  AND NOT ('READ_CONVENIO' = ANY("permissions"));

-- 2) Convênio Unimed com o conteúdo da página antiga (ruraltr.com.br/pgs/print_unimed.php),
--    pra página pública já nascer preenchida. Tudo editável depois no admin.
INSERT INTO "Convenio" (
    "id", "slug", "name", "title", "subtitle",
    "priceLabelHeader", "priceValueHeader", "priceRows",
    "documentsTitle", "documents",
    "highlightsTitle", "highlights",
    "aboutTitle", "aboutText",
    "isActive", "order", "updatedAt"
) VALUES (
    gen_random_uuid()::text, 'unimed', 'Unimed', 'Tabela de valores / Unimed', 'Sindicato Rural de Terra Roxa - PR',
    'Faixa etária', 'Valor sindicato',
    '[
        {"label": "0 a 18 anos",      "priceCents": 31713},
        {"label": "19 a 23 anos",     "priceCents": 42245},
        {"label": "24 a 28 anos",     "priceCents": 49847},
        {"label": "29 a 33 anos",     "priceCents": 57422},
        {"label": "34 a 38 anos",     "priceCents": 65398},
        {"label": "39 a 43 anos",     "priceCents": 74564},
        {"label": "44 a 48 anos",     "priceCents": 89054},
        {"label": "49 a 53 anos",     "priceCents": 105373},
        {"label": "54 a 58 anos",     "priceCents": 135380},
        {"label": "acima de 59 anos", "priceCents": 188925}
    ]'::jsonb,
    'Documentos para adesão',
    '["RG", "CPF", "Cartão do SUS", "Cartão do CAD-PRO", "Certidão de nascimento", "Certidão de casamento", "Comprovante de residência"]'::jsonb,
    'Estrutura Unimed',
    '["Somos 345 cooperativas", "116 mil médicos cooperados", "17 milhões de beneficiários", "2.372 hospitais credenciados", "126 hospitais próprios"]'::jsonb,
    'Investimos na valorização dos médicos e praticamos uma medicina humana, ampla e preventiva',
    E'Por isso, cuidamos das pessoas com leveza, proximidade e alegria. Incentivamos a busca equilibrada do bem-estar e da felicidade em todos os momentos como melhor forma de prevenção e promoção da saúde.\n\nAcreditamos na diversidade, na sinergia, na singularidade, na interdependência e na união como filosofia de vida.',
    true, 0, CURRENT_TIMESTAMP
)
ON CONFLICT ("slug") DO NOTHING;
