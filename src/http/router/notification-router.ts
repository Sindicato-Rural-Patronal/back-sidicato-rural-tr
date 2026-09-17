import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client/extension';
import { createNotificationAdapter } from '../../adapter/database/notification-adapter.js';
import { createPendingNotificationsAdapter } from '../../adapter/database/pending-notifications-adapter.js';
import { createUserAdminAdapter } from '../../adapter/database/user-admin-adapter.js';
import { createRuleAdapter } from '../../adapter/database/rule-adapter.js';
import { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { computePendingNotifications } from '../../usecase/pending-notifications.js';
import { ListNotificationsUseCase, MarkNotificationsReadUseCase } from '../../usecase/notifications.js';
import { NotificationController } from '../controllers/notification-controller.js';
import { errorResponse } from '../lib/swagger-schemas.js';

const str = { type: 'string' };
const nstr = { type: 'string',
nullable: true };
const tags = ['Admin — Notificações'];
const security = [{ bearerAuth: [] }];

const eventSchema = {
    type: 'object',
    properties: {
        id: str,
        type: str,
        title: str,
        body: nstr,
        link: nstr,
        createdAt: { type: 'string',
format: 'date-time' },
        read: { type: 'boolean' },
    },
};

const pendingSchema = {
    type: 'object',
    properties: {
        type: str,
        title: str,
        body: nstr,
        count: { type: 'integer' },
        link: nstr,
        severity: { type: 'string',
enum: ['info', 'warning'] },
    },
};

export async function notificationRouter(fastify: FastifyInstance, prisma: PrismaClient) {
    const repo = createNotificationAdapter(prisma);
    const pendingRepo = createPendingNotificationsAdapter(prisma);
    const getAdminPermissions = new GetAdminPermissionsUseCase(createUserAdminAdapter(prisma), createRuleAdapter(prisma));

    const controller = new NotificationController(
        new ListNotificationsUseCase(repo, (permissions, now) => computePendingNotifications(pendingRepo, permissions, now)),
        new MarkNotificationsReadUseCase(repo),
        getAdminPermissions,
    );

    fastify.get(
        '/admin/notifications',
        {
            schema: {
                tags,
                summary: 'Sino do painel: eventos e pendências',
                description: `Qualquer admin logado. Só aparece o que a regra do admin permite ver.

- \`events\`: inscrições em curso, mensagens de contato e convites aceitos dos últimos 30 dias (mais recentes primeiro, até 50); \`read\` = este admin já leu.
- \`unreadCount\`: eventos não lidos na janela.
- \`pending\`: pendências calculadas na hora (não são gravadas); \`pendingCount\` = tamanho da lista.`,
                security,
                response: {
                    200: {
                        type: 'object',
                        properties: {
                            unreadCount: { type: 'integer' },
                            pendingCount: { type: 'integer' },
                            events: { type: 'array',
items: eventSchema },
                            pending: { type: 'array',
items: pendingSchema },
                        },
                    },
                    401: errorResponse,
                },
            },
        },
        (req: FastifyRequest, res: FastifyReply) => controller.handleList(req, res),
    );

    fastify.patch(
        '/admin/notifications/read',
        {
            schema: {
                tags,
                summary: 'Marcar notificações como lidas',
                description: 'Sem `ids`: todos os eventos visíveis ainda não lidos por este admin. Com `ids`: só esses (se visíveis). Responde quantos foram marcados agora.',
                security,
                body: {
                    type: 'object',
                    nullable: true,
                    properties: {
                        ids: { type: 'array',
items: str,
maxItems: 500 },
                    },
                },
                response: {
                    200: { type: 'object',
properties: { updated: { type: 'integer' } } },
                    400: errorResponse,
                    401: errorResponse,
                },
            },
        },
        (req: FastifyRequest, res: FastifyReply) => controller.handleMarkRead(req, res),
    );
}
