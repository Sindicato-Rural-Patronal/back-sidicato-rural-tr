import type { FastifyReply, FastifyRequest } from 'fastify';
import { errorToStatus } from '../lib/require-permission.js';
import { adminOf } from '../lib/route-auth.js';
import type { ListNotificationsUseCase, MarkNotificationsReadUseCase } from '../../usecase/notifications.js';

/**
 * Qualquer admin logado (`loggedIn()` na rota). As permissões, lidas uma vez
 * pelo hook, filtram o que aparece. O painel consulta o sino com frequência.
 */
export class NotificationController {
    constructor(
        private readonly list: ListNotificationsUseCase,
        private readonly markRead: MarkNotificationsReadUseCase,
    ) {}

    async handleList(req: FastifyRequest, reply: FastifyReply) {
        const admin = adminOf(req);
        const { result } = await this.list.execute(admin.id, [...admin.permissions]);
        return reply.status(200).send(result);
    }

    async handleMarkRead(req: FastifyRequest, reply: FastifyReply) {
        const admin = adminOf(req);
        const response = await this.markRead.execute(admin.id, [...admin.permissions], req.body);
        if (response.error) {
            return reply.status(errorToStatus(response.error)).send({ error: response.error.message });
        }
        return reply.status(200).send({ updated: response.updated ?? 0 });
    }
}
