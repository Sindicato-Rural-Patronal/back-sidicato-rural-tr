/** Evento do sino do painel. `permission` = permissão exigida para ver. */
export type NotificationEvent = {
    type: string;
    title: string;
    body?: string | null;
    link?: string | null;
    permission: string;
    entityId?: string | null;
};

/** Evento como o admin vê: `read` = esse admin já leu. */
export type NotificationItem = {
    id: string;
    type: string;
    title: string;
    body: string | null;
    link: string | null;
    createdAt: Date;
    read: boolean;
};

/** O que um admin enxerga: permissões da regra, janela de tempo e o próprio admin (leituras). */
export type NotificationScope = {
    adminId: string;
    permissions: string[];
    since: Date;
};

/**
 * Publica eventos. Não deve lançar: notificação não pode derrubar a ação que
 * a gerou (inscrição, mensagem, convite).
 */
export interface NotificationPublisher {
    publish(event: NotificationEvent): Promise<void>;
}

export interface NotificationRepository {
    /** Mais recentes primeiro, no máximo `limit`. */
    listVisible(scope: NotificationScope, limit: number): Promise<NotificationItem[]>;
    countUnread(scope: NotificationScope): Promise<number>;
    /** Marca como lidas as visíveis ainda não lidas (só as de `ids`, se vier). Devolve quantas marcou. */
    markRead(scope: NotificationScope, ids?: string[]): Promise<number>;
}
