import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { createUserDataAdapter } from '../../adapter/database/user-data.js';
import { createUserRelationAdapter } from '../../adapter/database/user-relation-adapter.js';
import { AddUserRelationUseCase } from '../../usecase/add-user-relation.js';
import { DeleteUserRelationUseCase } from '../../usecase/delete-user-relation.js';
import { ListUserRelationsUseCase } from '../../usecase/list-user-relations.js';
import { AddUserRelationController } from '../controllers/add-user-relation.js';
import { DeleteUserRelationController } from '../controllers/delete-user-relation.js';
import { ListUserRelationsController } from '../controllers/list-user-relations.js';
import { errorResponse, paginationQuerystring, pagedResponse } from '../lib/swagger-schemas.js';
import { requires } from '../lib/route-auth.js';

export async function userRelationRouter(fastify: FastifyInstance, prisma: PrismaClient) {
    const userDataRepository = createUserDataAdapter(prisma);
    const userRelationRepository = createUserRelationAdapter(prisma);

    const listUserRelationsController = new ListUserRelationsController(
        new ListUserRelationsUseCase(userRelationRepository),
    );
    const addUserRelationController = new AddUserRelationController(
        new AddUserRelationUseCase(userDataRepository, userRelationRepository),
    );
    const deleteUserRelationController = new DeleteUserRelationController(
        new DeleteUserRelationUseCase(userRelationRepository),
    );

    fastify.get(
        '/admin/users/:id/relations',
        {
            config: { auth: requires('READ_USER') },
            schema: {
                tags: ['Admin — Relations'],
                summary: 'List relations of a worker',
                params: {
                    type: 'object',
                    properties: { id: { type: 'string' } },
                    required: ['id'],
                },
                querystring: paginationQuerystring,
                response: {
                    200: pagedResponse({
                                    type: 'object',
                                    properties: {
                                        id: { type: 'string' },
                                        sourceId: { type: 'string' },
                                        targetId: { type: 'string' },
                                        label: { type: 'string',
nullable: true },
                                        target: {
                                            type: 'object',
                                            properties: {
                                                id: { type: 'string' },
                                                name: { type: 'string' },
                                                cpf: { type: 'string',
nullable: true },
                                            },
                                        },
                                    },
                                }),
                    401: errorResponse,
                    403: errorResponse,
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
            config: { auth: requires('UPDATE_USER') },
            schema: {
                tags: ['Admin — Relations'],
                summary: 'Link two worker records as related',
                description: 'Creates a bidirectional relation between two workers. The inverse relation (B→A) is created automatically with no label.',
                params: {
                    type: 'object',
                    properties: { id: { type: 'string' } },
                    required: ['id'],
                },
                body: {
                    type: 'object',
                    required: ['targetId'],
                    properties: {
                        targetId: { type: 'string',
example: '550e8400-e29b-41d4-a716-446655440001' },
                        label: { type: 'string',
example: 'cônjuge' },
                    },
                },
                response: {
                    201: { type: 'object',
properties: { id: { type: 'string' } } },
                    400: errorResponse,
                    401: errorResponse,
                    403: errorResponse,
                    404: errorResponse,
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
            config: { auth: requires('UPDATE_USER') },
            schema: {
                tags: ['Admin — Relations'],
                summary: 'Remove a relation between two workers',
                description: 'Deletes the relation and its inverse automatically.',
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
                    401: errorResponse,
                    403: errorResponse,
                    404: errorResponse,
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
