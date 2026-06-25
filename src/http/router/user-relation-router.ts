import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client/extension';
import { createUserDataAdapter } from '../../adapter/database/user-data.js';
import { createUserRelationAdapter } from '../../adapter/database/user-relation-adapter.js';
import { createUserAdminAdapter } from '../../adapter/database/user-admin-adapter.js';
import { createRuleAdapter } from '../../adapter/database/rule-adapter.js';
import { AddUserRelationUseCase } from '../../usecase/add-user-relation.js';
import { DeleteUserRelationUseCase } from '../../usecase/delete-user-relation.js';
import { ListUserRelationsUseCase } from '../../usecase/list-user-relations.js';
import { AddUserRelationController } from '../controllers/add-user-relation.js';
import { DeleteUserRelationController } from '../controllers/delete-user-relation.js';
import { ListUserRelationsController } from '../controllers/list-user-relations.js';
import { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';

export async function userRelationRouter(fastify: FastifyInstance, prisma: PrismaClient) {
    const userDataRepository = createUserDataAdapter(prisma);
    const userRelationRepository = createUserRelationAdapter(prisma);
    const userAdminRepository = createUserAdminAdapter(prisma);
    const ruleRepository = createRuleAdapter(prisma);
    const getAdminPermissions = new GetAdminPermissionsUseCase(userAdminRepository, ruleRepository);

    const listUserRelationsController = new ListUserRelationsController(
        new ListUserRelationsUseCase(userRelationRepository),
        getAdminPermissions,
    );
    const addUserRelationController = new AddUserRelationController(
        new AddUserRelationUseCase(userDataRepository, userRelationRepository),
        getAdminPermissions,
    );
    const deleteUserRelationController = new DeleteUserRelationController(
        new DeleteUserRelationUseCase(userRelationRepository),
        getAdminPermissions,
    );

    fastify.get(
        '/admin/users/:id/relations',
        {
            schema: {
                tags: ['Admin — Relations'],
                summary: 'List relations of a worker',
                security: [{ bearerAuth: [] }],
                params: {
                    type: 'object',
                    properties: { id: { type: 'string' } },
                    required: ['id'],
                },
                querystring: {
                    type: 'object',
                    properties: {
                        page: { type: 'integer', minimum: 1, default: 1 },
                        limit: { type: 'integer', minimum: 1, maximum: 1000, default: 20 },
                    },
                },
                response: {
                    200: {
                        type: 'object',
                        properties: {
                            data: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        id: { type: 'string' },
                                        sourceId: { type: 'string' },
                                        targetId: { type: 'string' },
                                        label: { type: 'string', nullable: true },
                                        target: {
                                            type: 'object',
                                            properties: {
                                                id: { type: 'string' },
                                                name: { type: 'string' },
                                                cpf: { type: 'string', nullable: true },
                                            },
                                        },
                                    },
                                },
                            },
                            total: { type: 'integer' },
                            page: { type: 'integer' },
                            limit: { type: 'integer' },
                            totalPages: { type: 'integer' },
                        },
                    },
                    401: { type: 'object', properties: { error: { type: 'string' } } },
                    403: { type: 'object', properties: { error: { type: 'string' } } },
                },
            },
        },
        (req: FastifyRequest, res: FastifyReply) =>
            listUserRelationsController.handle(
                req as Parameters<typeof listUserRelationsController.handle>[0],
                res,
            ),
    );

    fastify.post(
        '/admin/users/:id/relations',
        {
            schema: {
                tags: ['Admin — Relations'],
                summary: 'Link two worker records as related',
                description: 'Creates a bidirectional relation between two workers. The inverse relation (B→A) is created automatically with no label.',
                security: [{ bearerAuth: [] }],
                params: {
                    type: 'object',
                    properties: { id: { type: 'string' } },
                    required: ['id'],
                },
                body: {
                    type: 'object',
                    required: ['targetId'],
                    properties: {
                        targetId: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440001' },
                        label: { type: 'string', example: 'cônjuge' },
                    },
                },
                response: {
                    201: { type: 'object', properties: { id: { type: 'string' } } },
                    400: { type: 'object', properties: { error: { type: 'string' } } },
                    401: { type: 'object', properties: { error: { type: 'string' } } },
                    403: { type: 'object', properties: { error: { type: 'string' } } },
                    404: { type: 'object', properties: { error: { type: 'string' } } },
                },
            },
        },
        (req: FastifyRequest, res: FastifyReply) =>
            addUserRelationController.handle(
                req as Parameters<typeof addUserRelationController.handle>[0],
                res,
            ),
    );

    fastify.delete(
        '/admin/users/:id/relations/:relationId',
        {
            schema: {
                tags: ['Admin — Relations'],
                summary: 'Remove a relation between two workers',
                description: 'Deletes the relation and its inverse automatically.',
                security: [{ bearerAuth: [] }],
                params: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' },
                        relationId: { type: 'string' },
                    },
                    required: ['id', 'relationId'],
                },
                response: {
                    204: { type: 'null' },
                    401: { type: 'object', properties: { error: { type: 'string' } } },
                    403: { type: 'object', properties: { error: { type: 'string' } } },
                    404: { type: 'object', properties: { error: { type: 'string' } } },
                },
            },
        },
        (req: FastifyRequest, res: FastifyReply) =>
            deleteUserRelationController.handle(
                req as Parameters<typeof deleteUserRelationController.handle>[0],
                res,
            ),
    );
}
