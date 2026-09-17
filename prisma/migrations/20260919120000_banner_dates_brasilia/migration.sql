-- Datas dos banners no horário de Brasília (America/Sao_Paulo, -03:00, sem
-- horário de verão). O painel gravava o dia escolhido como 00:00:00.000Z (início)
-- e 23:59:59.999Z (término): o banner entrava no ar às 21h da véspera e saía às
-- 20:59 do último dia. Agora grava 00:00 e 23:59:59.999 de Brasília (03:00Z e
-- 02:59:59.999Z do dia seguinte). Só mexe nos valores com exatamente aqueles
-- horários (os que o painel antigo gravou); rodar de novo não casa mais nada.
UPDATE "Banner"
SET "startDate" = "startDate" + INTERVAL '3 hours'
WHERE "startDate" IS NOT NULL
  AND "startDate"::time = TIME '00:00:00';

UPDATE "Banner"
SET "endDate" = "endDate" + INTERVAL '3 hours'
WHERE "endDate" IS NOT NULL
  AND "endDate"::time = TIME '23:59:59.999';
