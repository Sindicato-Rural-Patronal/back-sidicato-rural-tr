import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { CreateUserController } from '../controllers/create-user.js';
import { CreateUserUseCase } from '../../usecase/create-user-data.js';
import { createUserDataAdapter } from '../../adapter/database/user-data.js';
import type { PrismaClient } from '@prisma/client/extension';
import { ListUsersController } from '../controllers/list-users.js';
import { ListUsersUseCase } from '../../usecase/list-users.js';
import { createUserAdminAdapter } from '../../adapter/database/user-admin-adapter.js';
import { createRuleAdapter } from '../../adapter/database/rule-adapter.js';
import { UpdateUserController } from '../controllers/update-user.js';
import { UpdateUserDataUseCase } from '../../usecase/update-user-data.js';
import { DeleteUserController } from '../controllers/delete-user.js';
import { DeleteUserDataUseCase } from '../../usecase/delete-user-data.js';
import { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';

export async function userDataRouter(fastify: FastifyInstance, prisma: PrismaClient) {
    const userRepository = createUserDataAdapter(prisma);
    const userAdminRepository = createUserAdminAdapter(prisma);
    const ruleRepository = createRuleAdapter(prisma);
    const getAdminPermissions = new GetAdminPermissionsUseCase(userAdminRepository, ruleRepository);

    const createUserController = new CreateUserController(new CreateUserUseCase(userRepository));
    const listUsersController = new ListUsersController(
        new ListUsersUseCase(userRepository),
        getAdminPermissions,
    );
    const updateUserController = new UpdateUserController(
        new UpdateUserDataUseCase(userRepository),
        getAdminPermissions,
    );
    const deleteUserController = new DeleteUserController(
        new DeleteUserDataUseCase(userRepository),
        getAdminPermissions,
    );

    fastify.get(
        '/admin/users',
        {
            schema: {
                tags: ['Admin — Users'],
                summary: 'List workers (internal)',
                security: [{ bearerAuth: [] }],
                querystring: {
                    type: 'object',
                    properties: {
                        page: { type: 'integer',
minimum: 1,
default: 1 },
                        limit: { type: 'integer',
minimum: 1,
maximum: 100,
default: 20 },
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
                                        name: { type: 'string' },
                                        email: { type: 'string' },
                                        phone: { type: 'string' },
                                        cpf: { type: 'string',
nullable: true },
                                        cnpj: { type: 'string',
nullable: true },
                                        avatar: { type: 'string',
nullable: true },
                                        createdAt: { type: 'string' },
                                        updatedAt: { type: 'string' },
                                    },
                                },
                            },
                            total: { type: 'integer' },
                            page: { type: 'integer' },
                            limit: { type: 'integer' },
                            totalPages: { type: 'integer' },
                        },
                    },
                    403: { type: 'object',
properties: { error: { type: 'string' } } },
                },
            },
        },
        (req: FastifyRequest, res: FastifyReply) => listUsersController.handle(req, res),
    );

    fastify.post(
        '/users',
        {
            schema: {
                tags: ['Users'],
                summary: 'Create worker user',
                description: `Creates a new UserData (rural worker). Public route — no authentication required.

**Business rules:**
- \`email\` and \`cpf\` must be unique in the system — returns 409 if already registered
- This record represents the rural worker; to have admin access, a \`UserAdmin\` linked to this record must be created (via \`POST /admin/users\`)
- The \`cnpj\` field is optional (for legal-entity rural producers)`,
                body: {
                    type: 'object',
                    required: ['name', 'email', 'phone', 'cpf'],
                    properties: {
                        name: { type: 'string' },
                        email: { type: 'string',
format: 'email' },
                        phone: { type: 'string' },
                        cpf: { type: 'string' },
                    },
                },
                response: {
                    201: {
                        description: 'User created successfully',
                        type: 'object',
                        properties: {
                            id: { type: 'string' },
                            name: { type: 'string' },
                            email: { type: 'string' },
                            phone: { type: 'string' },
                            cpf: { type: 'string' },
                            createdAt: { type: 'string',
format: 'date-time' },
                        },
                    },
                    409: {
                        description: 'Email or phone already registered',
                        type: 'object',
                        properties: { error: { type: 'string' } },
                    },
                    500: {
                        description: 'Internal error creating user',
                        type: 'object',
                        properties: { error: { type: 'string' } },
                    },
                },
            },
        },
        (req: FastifyRequest, res: FastifyReply) => createUserController.handle(req, res),
    );

    fastify.patch(
        '/users/:id',
        {
            schema: {
                tags: ['Users'],
                summary: 'Update worker user',
                security: [{ bearerAuth: [] }],
                params: {
                    type: 'object',
                    properties: { id: { type: 'string' } },
                    required: ['id'],
                },
                body: {
                    type: 'object',
                    properties: {
                        name: { type: 'string' },
                        email: { type: 'string',
format: 'email' },
                        phone: { type: 'string' },
                        cpf: { type: 'string',
nullable: true },
                        cnpj: { type: 'string',
nullable: true },
                    },
                },
                response: {
                    200: { type: 'object',
properties: { message: { type: 'string' } } },
                    400: { type: 'object',
properties: { error: { type: 'string' } } },
                    401: { type: 'object',
properties: { error: { type: 'string' } } },
                    403: { type: 'object',
properties: { error: { type: 'string' } } },
                    404: { type: 'object',
properties: { error: { type: 'string' } } },
                    409: { type: 'object',
properties: { error: { type: 'string' } } },
                },
            },
        },
        (req: FastifyRequest, res: FastifyReply) =>
            updateUserController.handle(
                req as Parameters<typeof updateUserController.handle>[0],
                res,
            ),
    );

    fastify.delete(
        '/users/:id',
        {
            schema: {
                tags: ['Users'],
                summary: 'Delete worker user',
                security: [{ bearerAuth: [] }],
                params: {
                    type: 'object',
                    properties: { id: { type: 'string' } },
                    required: ['id'],
                },
                response: {
                    204: { type: 'null' },
                    401: { type: 'object',
properties: { error: { type: 'string' } } },
                    403: { type: 'object',
properties: { error: { type: 'string' } } },
                    404: { type: 'object',
properties: { error: { type: 'string' } } },
                },
            },
        },
        (req: FastifyRequest, res: FastifyReply) =>
            deleteUserController.handle(
                req as Parameters<typeof deleteUserController.handle>[0],
                res,
            ),
    );
}
