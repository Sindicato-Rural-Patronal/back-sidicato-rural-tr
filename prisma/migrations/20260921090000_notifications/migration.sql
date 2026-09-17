-- Notificações do painel (sino): eventos de ações públicas e leituras por admin.
-- Só cria tabelas novas; não mexe em dados existentes.
CREATE TABLE IF NOT EXISTS "Notification" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "permission" TEXT NOT NULL,
    "entityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Notification_createdAt_idx" ON "Notification"("createdAt");

CREATE TABLE IF NOT EXISTS "NotificationRead" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationRead_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "NotificationRead_notificationId_adminId_key" ON "NotificationRead"("notificationId", "adminId");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NotificationRead_notificationId_fkey') THEN
        ALTER TABLE "NotificationRead" ADD CONSTRAINT "NotificationRead_notificationId_fkey"
            FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
