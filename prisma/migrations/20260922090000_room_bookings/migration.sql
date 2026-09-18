-- Reservas de sala (eventos e reuniões), além dos cursos.
-- Só cria o enum e a tabela novos; não mexe em dados existentes.
-- Horários como os do curso: hora "de parede" de Brasília rotulada em UTC.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BookingType') THEN
        CREATE TYPE "BookingType" AS ENUM ('EVENT', 'MEETING');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "RoomBooking" (
    "id" TEXT NOT NULL,
    "type" "BookingType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "roomId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "responsibleUserDataId" TEXT,
    "responsibleName" TEXT,
    "seriesId" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomBooking_pkey" PRIMARY KEY ("id"),
    -- Término sempre depois do início (a aplicação já valida; aqui é a garantia).
    CONSTRAINT "RoomBooking_time_order" CHECK ("endTime" > "startTime")
);

CREATE INDEX IF NOT EXISTS "RoomBooking_roomId_startTime_idx" ON "RoomBooking"("roomId", "startTime");
CREATE INDEX IF NOT EXISTS "RoomBooking_seriesId_idx" ON "RoomBooking"("seriesId");

DO $$
BEGIN
    -- Sala removida leva as reservas junto (a remoção só é permitida sem reservas futuras).
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RoomBooking_roomId_fkey') THEN
        ALTER TABLE "RoomBooking" ADD CONSTRAINT "RoomBooking_roomId_fkey"
            FOREIGN KEY ("roomId") REFERENCES "room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    -- Pessoa removida de verdade: a reserva fica sem responsável cadastrado.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RoomBooking_responsibleUserDataId_fkey') THEN
        ALTER TABLE "RoomBooking" ADD CONSTRAINT "RoomBooking_responsibleUserDataId_fkey"
            FOREIGN KEY ("responsibleUserDataId") REFERENCES "UserData"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
