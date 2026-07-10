import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client/extension';
import { CreateRuleController } from '../controllers/create-rule.js';
import { CreateRuleUseCase } from '../../usecase/create-rule.js';
import { UpdateRuleController } from '../controllers/update-rule.js';
import { UpdateRuleUseCase } from '../../usecase/update-rule.js';
import { createRuleAdapter } from '../../adapter/database/rule-adapter.js';
import { ListRulesController } from '../controllers/list-rules.js';
import { ListRulesUseCase } from '../../usecase/list-rules.js';
import { createUserAdminAdapter } from '../../adapter/database/user-admin-adapter.js';
import { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { errorResponse, paginationQuerystring, pagedResponse } from '../lib/swagger-schemas.js';

const PERMISSIONS_ENUM = [
    'CREATE_USER',
    'UPDATE_USER',
    'DELETE_USER',
    'READ_USER',
    'CREATE_COURSE',
    'UPDATE_COURSE',
    'DELETE_COURSE',
    'READ_COURSE',
    'CREATE_RULE',
    'UPDATE_RULE',
    'DELETE_RULE',
    'READ_RULE',
    'CREATE_USER_ADMIN',
    'UPDATE_USER_ADMIN',
    'DELETE_USER_ADMIN',
    'READ_USER_ADMIN',
    'CREATE_NEWS',
    'UPDATE_NEWS',
    'DELETE_NEWS',
    'READ_NEWS',
    'READ_CONTACT',
    'UPDATE_CONTACT',
    'CREATE_BANNER',
    'UPDATE_BANNER',
    'DELETE_BANNER',
    'READ_BANNER',
] as const;

export async function ruleRouter(fastify: FastifyInstance, prisma: PrismaClient) {
    const ruleRepository = createRuleAdapter(prisma);
    const userAdminRepository = createUserAdminAdapter(prisma);
    const getAdminPermissions = new GetAdminPermissionsUseCase(userAdminRepository, ruleRepository);

    const createRuleController = new CreateRuleController(
        new CreateRuleUseCase(ruleRepository),
        getAdminPermissions,
    );
    const updateRuleController = new UpdateRuleController(
        new UpdateRuleUseCase(ruleRepository),
        getAdminPermissions,
    );
    const listRulesController = new ListRulesController(
        new ListRulesUseCase(ruleRepository),
        getAdminPermissions,
    );

    fastify.get(
        '/admin/rules',
        {
            schema: {
                tags: ['Admin — Rules'],
                summary: 'List permission rules (internal)',
                security: [{ bearerAuth: [] }],
                querystring: paginationQuerystring,
                response: {
                    200: pagedResponse({
                                    type: 'object',
                                    properties: {
                                        id: { type: 'string' },
                                        name: { type: 'string' },
                                        description: { type: 'string' },
                                        permissions: { type: 'array',
items: { type: 'string' } },
                                        createdAt: { type: 'string' },
                                        updatedAt: { type: 'string' },
                                    },
                                }),
                    401: errorResponse,
                    403: errorResponse,
                },
            },
        },
        (req: FastifyRequest, res: FastifyReply) => listRulesController.handle(req, res),
    );

    fastify.post(
        '/rules',
        {
            schema: {
                tags: ['Rules'],
                summary: 'Create permission rule',
                security: [{ bearerAuth: [] }],
                body: {
                    type: 'object',
                    required: ['name', 'permissions'],
                    properties: {
                        name: { type: 'string',
example: 'Gestor de Cursos' },
                        description: { type: 'string',
example: 'Pode criar, editar e excluir cursos e visualizar inscrições.' },
                        permissions: {
                            type: 'array',
                            minItems: 1,
                            items: { type: 'string',
enum: PERMISSIONS_ENUM },
                            example: ['CREATE_COURSE', 'UPDATE_COURSE', 'DELETE_COURSE', 'READ_COURSE'],
                        },
                    },
                },
                response: {
                    201: {
                        type: 'object',
                        properties: {
                            id: { type: 'string' },
                            name: { type: 'string' },
                            description: { type: 'string' },
                            permissions: { type: 'array',
items: { type: 'string' } },
                            createdAt: { type: 'string',
format: 'date-time' },
                            updatedAt: { type: 'string',
format: 'date-time' },
                        },
                    },
                    400: errorResponse,
                    401: errorResponse,
                    403: errorResponse,
                },
            },
        },
        (req: FastifyRequest, res: FastifyReply) => createRuleController.handle(req, res),
    );

    fastify.patch(
        '/rules/:ruleId',
        {
            schema: {
                tags: ['Rules'],
                summary: 'Update permission rule',
                security: [{ bearerAuth: [] }],
                params: {
                    type: 'object',
                    required: ['ruleId'],
                    properties: { ruleId: { type: 'string' } },
                },
                body: {
                    type: 'object',
                    properties: {
                        name: { type: 'string',
example: 'Gestor de Cursos' },
                        description: { type: 'string',
example: 'Pode criar, editar e excluir cursos e visualizar inscrições.' },
                        permissions: {
                            type: 'array',
                            minItems: 1,
                            items: { type: 'string',
enum: PERMISSIONS_ENUM },
                            example: ['CREATE_COURSE', 'UPDATE_COURSE', 'READ_COURSE'],
                        },
                    },
                },
                response: {
                    200: { type: 'object',
properties: { message: { type: 'string' } } },
                    400: errorResponse,
                    401: errorResponse,
                    403: errorResponse,
                    404: errorResponse,
                },
            },
        },
        (req: FastifyRequest<{ Params: { ruleId: string } }>, res: FastifyReply) =>
            updateRuleController.handle(req, res),
    );
}
