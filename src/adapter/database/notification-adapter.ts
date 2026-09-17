import type { PrismaClient } from '@prisma/client/extension';
import type {
    NotificationEvent,
    NotificationItem,
    NotificationPublisher,
    NotificationRepository,
    NotificationScope,
} from '../../ports/external/notification-repository.js';

/** Eventos mais velhos que isso são apagados. */
export const NOTIFICATION_RETENTION_DAYS = 90;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Compartilhado entre as instâncias (cada router cria a sua): a limpeza roda
// no máximo uma vez por hora por processo.
let lastCleanupAt = 0;

export function createNotificationPublisher(prisma: PrismaClient): NotificationPublisher {
    return new PrismaNotificationPublisher(prisma);
}

export function createNotificationAdapter(prisma: PrismaClient): NotificationRepository {
    return new NotificationAdapter(prisma);
}

class PrismaNotificationPublisher implements NotificationPublisher {
    constructor(private prisma: PrismaClient) {}

    async publish(event: NotificationEvent): Promise<void> {
        try {
            await this.prisma.notification.create({
                data: {
                    type: event.type,
                    title: event.title.slice(0, 300),
                    body: event.body ? event.body.slice(0, 500) : null,
                    link: event.link ?? null,
                    permission: event.permission,
                    entityId: event.entityId ?? null,
                },
            });
        } catch (e) {
            // Notificação nunca derruba a ação que a gerou.
            console.error('[notifications] falha ao publicar', event.type, e);
            return;
        }
        await this.cleanupOld();
    }

    private async cleanupOld(): Promise<void> {
        const now = Date.now();
        if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return;
        lastCleanupAt = now;
        try {
            await this.prisma.notification.deleteMany({
                where: { createdAt: { lt: new Date(now - NOTIFICATION_RETENTION_DAYS * DAY_MS) } },
            });
        } catch (e) {
            console.error('[notifications] falha ao apagar eventos antigos', e);
        }
    }
}

type Row = {
    id: string;
    type: string;
    title: string;
    body: string | null;
    link: string | null;
    createdAt: Date;
    reads: { id: string }[];
};

class NotificationAdapter implements NotificationRepository {
    constructor(private prisma: PrismaClient) {}

    private visible(scope: NotificationScope) {
        return { permission: { in: scope.permissions },
createdAt: { gte: scope.since } };
    }

    async listVisible(scope: NotificationScope, limit: number): Promise<NotificationItem[]> {
        const rows: Row[] = await this.prisma.notification.findMany({
            where: this.visible(scope),
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: limit,
            select: {
                id: true,
                type: true,
                title: true,
                body: true,
                link: true,
                createdAt: true,
                reads: { where: { adminId: scope.adminId },
select: { id: true } },
            },
        });
        return rows.map(({ reads, ...n }) => ({ ...n,
read: reads.length > 0 }));
    }

    countUnread(scope: NotificationScope): Promise<number> {
        return this.prisma.notification.count({
            where: { ...this.visible(scope),
reads: { none: { adminId: scope.adminId } } },
        });
    }

    async markRead(scope: NotificationScope, ids?: string[]): Promise<number> {
        const unread: { id: string }[] = await this.prisma.notification.findMany({
            where: {
                ...this.visible(scope),
                ...(ids ? { id: { in: ids } } : {}),
                reads: { none: { adminId: scope.adminId } },
            },
            select: { id: true },
        });
        if (unread.length === 0) return 0;
        // skipDuplicates: dois cliques ao mesmo tempo não dão erro nem contam em dobro.
        const { count } = await this.prisma.notificationRead.createMany({
            data: unread.map(n => ({ notificationId: n.id,
adminId: scope.adminId })),
            skipDuplicates: true,
        });
        return count;
    }
}
