-- Endereço e telefone confirmados pelo sindicato (os mesmos do Termo de Adesão).
-- Só troca se ainda estiver o valor padrão da migration anterior: o que o painel
-- já tiver editado fica como está.
UPDATE "SiteSetting" SET "value" = 'Rua José Tondato, 80', "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'org.street' AND "value" = 'Rua Sete de Setembro, 1847';

UPDATE "SiteSetting" SET "value" = '(44) 3645-2199', "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'org.phone' AND "value" = '(44) 3645-1200';
