-- Agendamento de notícia e publicação de evento no site.
-- Só adiciona colunas com valor padrão/nulo: nada muda no que já existe
-- (notícia sem agendamento continua no ar; reserva antiga fica fora do site).

-- Notícia: instante em que entra no ar (hora "de parede" de Brasília com Z,
-- como os cursos). NULL = no ar assim que o status for PUBLISHED.
ALTER TABLE "News" ADD COLUMN IF NOT EXISTS "publishAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "News_status_publishAt_idx" ON "News"("status", "publishAt");

-- Reserva de sala: aparece na página pública de eventos (só type = 'EVENT').
ALTER TABLE "RoomBooking" ADD COLUMN IF NOT EXISTS "publicOnSite" BOOLEAN NOT NULL DEFAULT false;

-- Texto do evento no site. Separado de "description", que são as observações
-- internas da equipe.
ALTER TABLE "RoomBooking" ADD COLUMN IF NOT EXISTS "publicDescription" TEXT;

CREATE INDEX IF NOT EXISTS "RoomBooking_publicOnSite_startTime_idx" ON "RoomBooking"("publicOnSite", "startTime");
