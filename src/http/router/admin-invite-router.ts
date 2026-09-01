import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client/extension';
import { createAdminInviteAdapter } from '../../adapter/database/admin-invite-adapter.js';
import { createUserDataAdapter } from '../../adapter/database/user-data.js';
import { createRuleAdapter } from '../../adapter/database/rule-adapter.js';
import { createUserAdminAdapter } from '../../adapter/database/user-admin-adapter.js';
import { CreateAdminInviteUseCase } from '../../usecase/create-admin-invite.js';
import { GetAdminInviteUseCase } from '../../usecase/get-admin-invite.js';
import { AcceptAdminInviteUseCase } from '../../usecase/accept-admin-invite.js';
import { AdminInviteController } from '../controllers/admin-invite-controller.js';
import { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { errorResponse } from '../lib/swagger-schemas.js';

export async function adminInviteRouter(fastify: FastifyInstance, prisma: PrismaClient) {
    const inviteRepo = createAdminInviteAdapter(prisma);
    const userDataRepo = createUserDataAdapter(prisma);
    const ruleRepo = createRuleAdapter(prisma);
    const userAdminRepo = createUserAdminAdapter(prisma);
    const getAdminPermissions = new GetAdminPermissionsUseCase(userAdminRepo, ruleRepo);

    const controller = new AdminInviteController(
        new CreateAdminInviteUseCase(inviteRepo, userDataRepo, ruleRepo, userAdminRepo),
        new GetAdminInviteUseCase(inviteRepo, userDataRepo, ruleRepo),
        new AcceptAdminInviteUseCase(inviteRepo, userAdminRepo),
        getAdminPermissions,
    );

    fastify.post(
        '/admin/invites',
        {
            schema: {
                tags: ['Admin — Invites'],
                summary: 'Create an admin invite (person + rule) → token/link',
                security: [{ bearerAuth: [] }],
                body: {
                    type: 'object',
                    required: ['userDataId', 'rulesId'],
                    properties: {
                        userDataId: { type: 'string' },
                        rulesId: { type: 'string' },
                    },
                },
                response: {
                    201: {
                        type: 'object',
                        properties: { token: { type: 'string' },
expiresAt: { type: 'string' } },
                    },
                    400: errorResponse,
                    401: errorResponse,
                    403: errorResponse,
                    404: errorResponse,
                    409: errorResponse,
                },
            },
        },
        (req: FastifyRequest<{ Body: { userDataId: string; rulesId: string } }>, res: FastifyReply) =>
            controller.create(req, res),
    );

    fastify.get(
        '/invites/:token',
        {
            schema: {
                tags: ['Invites'],
                summary: 'Public: view an invite (person + rule) if valid',
                params: {
                    type: 'object',
                    required: ['token'],
                    properties: { token: { type: 'string' } },
                },
                response: {
                    200: {
                        type: 'object',
                        properties: { userName: { type: 'string' },
ruleName: { type: 'string' } },
                    },
                    404: errorResponse,
                },
            },
        },
        (req: FastifyRequest<{ Params: { token: string } }>, res: FastifyReply) =>
            controller.get(req, res),
    );

    fastify.post(
        '/invites/:token/accept',
        {
            schema: {
                tags: ['Invites'],
                summary: 'Public: accept an invite — set username + password',
                params: {
                    type: 'object',
                    required: ['token'],
                    properties: { token: { type: 'string' } },
                },
                body: {
                    type: 'object',
                    required: ['username', 'password'],
                    properties: {
                        username: { type: 'string' },
                        password: { type: 'string' },
                    },
                },
                response: {
                    200: { type: 'object',
properties: { message: { type: 'string' } } },
                    400: errorResponse,
                    404: errorResponse,
                    409: errorResponse,
                },
            },
        },
        (
            req: FastifyRequest<{ Params: { token: string }; Body: { username: string; password: string } }>,
            res: FastifyReply,
        ) => controller.accept(req, res),
    );
}
