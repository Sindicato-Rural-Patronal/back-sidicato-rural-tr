import { z } from 'zod';
import type {
    NotificationItem,
    NotificationRepository,
    NotificationScope,
} from '../ports/external/notification-repository.js';
import type { PendingNotification } from './pending-notifications.js';
import { ValidationError } from '../errors/validation.js';

/** Janela do sino: eventos dos últimos 30 dias. */
export const NOTIFICATION_WINDOW_DAYS = 30;
/** Máximo de eventos devolvidos por vez. */
export const NOTIFICATION_EVENTS_LIMIT = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Pendências calculadas na hora (`computePendingNotifications`), já com o repositório. */
export type PendingProvider = (permissions: string[], now: Date) => Promise<PendingNotification[]>;

function scopeFor(adminId: string, permissions: string[], now: Date): NotificationScope {
    return { adminId,
permissions,
since: new Date(now.getTime() - NOTIFICATION_WINDOW_DAYS * DAY_MS) };
}

export type NotificationsResult = {
    unreadCount: number;
    pendingCount: number;
    events: NotificationItem[];
    pending: PendingNotification[];
};

/** Sino do painel: eventos que a regra do admin deixa ver + pendências do momento. */
export class ListNotificationsUseCase {
    constructor(
        private readonly repo: NotificationRepository,
        private readonly pending: PendingProvider,
        private readonly clock: () => Date = () => new Date(),
    ) {}

    async execute(adminId: string, permissions: string[]): Promise<{ result: NotificationsResult }> {
        const now = this.clock();
        const scope = scopeFor(adminId, permissions, now);
        const [events, unreadCount, pending] = await Promise.all([
            this.repo.listVisible(scope, NOTIFICATION_EVENTS_LIMIT),
            this.repo.countUnread(scope),
            this.pending(permissions, now),
        ]);
        return { result: { unreadCount,
pendingCount: pending.length,
events,
pending } };
    }
}

const markSchema = z.object({
    ids: z.array(z.string().min(1)).max(500).optional(),
});

/** Marca eventos como lidos por este admin: os `ids` informados ou, sem `ids`, todos os visíveis não lidos. */
export class MarkNotificationsReadUseCase {
    constructor(
        private readonly repo: NotificationRepository,
        private readonly clock: () => Date = () => new Date(),
    ) {}

    async execute(
        adminId: string,
        permissions: string[],
        body: unknown,
    ): Promise<{
 error?: Error;
updated?: number 
}> {
        const parsed = markSchema.safeParse(body ?? {});
        if (!parsed.success) {
            return { error: new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos') };
        }
        const { ids } = parsed.data;
        if (ids && ids.length === 0) return { updated: 0 };
        const updated = await this.repo.markRead(scopeFor(adminId, permissions, this.clock()), ids);
        return { updated };
    }
}
