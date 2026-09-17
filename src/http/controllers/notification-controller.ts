import type { FastifyReply, FastifyRequest } from 'fastify';
import { decodeToken } from '../../lib/auth.js';
import { errorToStatus } from '../lib/require-permission.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import type { ListNotificationsUseCase, MarkNotificationsReadUseCase } from '../../usecase/notifications.js';

export class NotificationController {
    constructor(
        private readonly list: ListNotificationsUseCase,
        private readonly markRead: MarkNotificationsReadUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    /**
     * Qualquer admin logado (como `requireAuth`), mas lendo as permissões uma vez
     * só: elas filtram o que aparece. O painel consulta o sino com frequência.
     */
    private async authenticate(
        req: FastifyRequest,
        reply: FastifyReply,
    ): Promise<{
 adminId: string;
permissions: string[] 
} | null> {
        const token = req.headers['authorization']?.replace('Bearer ', '') ?? '';
        const decoded = decodeToken(token);
        if (!decoded) {
            reply.status(401).send({ error: 'Unauthorized' });
            return null;
        }
        const permissions = await this.getAdminPermissions.execute(decoded.userId);
        if (!permissions) {
            reply.status(401).send({ error: 'Admin not found' });
            return null;
        }
        return { adminId: decoded.userId,
permissions };
    }

    async handleList(req: FastifyRequest, reply: FastifyReply) {
        const auth = await this.authenticate(req, reply);
        if (!auth) return;
        const { result } = await this.list.execute(auth.adminId, auth.permissions);
        return reply.status(200).send(result);
    }

    async handleMarkRead(req: FastifyRequest, reply: FastifyReply) {
        const auth = await this.authenticate(req, reply);
        if (!auth) return;
        const response = await this.markRead.execute(auth.adminId, auth.permissions, req.body);
        if (response.error) {
            return reply.status(errorToStatus(response.error)).send({ error: response.error.message });
        }
        return reply.status(200).send({ updated: response.updated ?? 0 });
    }
}
