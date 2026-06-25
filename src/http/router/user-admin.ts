import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client/extension';
import { CreateUserAdminController } from '../controllers/create-user-admin.js';
import { CreateUserAdminUseCase } from '../../usecase/create-user-admin.js';
import { createUserAdminAdapter } from '../../adapter/database/user-admin-adapter.js';
import { createUserDataAdapter } from '../../adapter/database/user-data.js';
import { createRuleAdapter } from '../../adapter/database/rule-adapter.js';
import { ListUserAdminsController } from '../controllers/list-user-admins.js';
import { ListUserAdminsUseCase } from '../../usecase/list-user-admins.js';
import { UpdateUserAdminController } from '../controllers/update-user-admin.js';
import { UpdateUserAdminUseCase } from '../../usecase/update-user-admin.js';
import { DeleteUserAdminController } from '../controllers/delete-user-admin.js';
import { DeleteUserAdminUseCase } from '../../usecase/delete-user-admin.js';
import { GetCurrentAdminController } from '../controllers/get-current-admin.js';
import { GetCurrentAdminUseCase } from '../../usecase/get-current-admin.js';
import { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { ListPublicContactsController } from '../controllers/list-public-contacts.js';
import { ListPublicContactsUseCase } from '../../usecase/list-public-contacts.js';

export async function userAdminRouter(fastify: FastifyInstance, prisma: PrismaClient) {
    const userAdminRepository = createUserAdminAdapter(prisma);
    const userDataRepository = createUserDataAdapter(prisma);
    const ruleRepository = createRuleAdapter(prisma);
    const getAdminPermissions = new GetAdminPermissionsUseCase(userAdminRepository, ruleRepository);

    const createUserAdminController = new CreateUserAdminController(
        new CreateUserAdminUseCase(userAdminRepository, userDataRepository, ruleRepository),
        getAdminPermissions,
    );
    const listUserAdminsController = new ListUserAdminsController(
        new ListUserAdminsUseCase(userAdminRepository),
        getAdminPermissions,
    );
    const updateUserAdminController = new UpdateUserAdminController(
        new UpdateUserAdminUseCase(userAdminRepository, ruleRepository),
        getAdminPermissions,
    );
    const deleteUserAdminController = new DeleteUserAdminController(
        new DeleteUserAdminUseCase(userAdminRepository),
        getAdminPermissions,
    );
    const getCurrentAdminController = new GetCurrentAdminController(
        new GetCurrentAdminUseCase(userAdminRepository, ruleRepository),
        getAdminPermissions,
    );
    const listPublicContactsController = new ListPublicContactsController(
        new ListPublicContactsUseCase(userAdminRepository),
    );

    fastify.get(
        '/contacts',
        {
            schema: {
                tags: ['Contatos Públicos'],
                summary: 'Listar contatos públicos',
                description: 'Retorna administradores marcados como públicos. Sem autenticação.',
                response: {
                    200: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                publicTitle: { type: 'string', nullable: true },
                                userData: {
                                    type: 'object',
                                    properties: {
                                        name: { type: 'string' },
                                        email: { type: 'string' },
                                        phone: { type: 'string' },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
        (req: FastifyRequest, res: FastifyReply) => listPublicContactsController.handle(req, res),
    );

    fastify.get(
        '/admin/me',
        {
            schema: {
                tags: ['Admin — Auth'],
                summary: 'Get current admin profile and permissions',
                description: `Returns the authenticated admin's profile and full permissions list. Use this to conditionally render UI elements based on what the current user can do.`,
                security: [{ bearerAuth: [] }],
                response: {
                    200: {
                        type: 'object',
                        properties: {
                            userId: { type: 'string' },
                            userDataId: { type: 'string' },
                            username: { type: 'string' },
                            rulesId: { type: 'string' },
                            ruleName: { type: 'string' },
                            permissions: { type: 'array',
items: { type: 'string' } },
                        },
                    },
                    401: { type: 'object',
properties: { error: { type: 'string' } } },
                    403: { type: 'object',
properties: { error: { type: 'string' } } },
                },
            },
        },
        (req: FastifyRequest, res: FastifyReply) => getCurrentAdminController.handle(req, res),
    );

    fastify.get(
        '/admin/users/admins',
        {
            schema: {
                tags: ['Admin — Users'],
                summary: 'List admin users (internal)',
                security: [{ bearerAuth: [] }],
                querystring: {
                    type: 'object',
                    properties: {
                        page: { type: 'integer', minimum: 1, default: 1 },
                        limit: { type: 'integer', minimum: 1, maximum: 1000, default: 20 },
                        search: { type: 'string', description: 'Busca por username, nome ou email' },
                        rulesId: { type: 'string', description: 'Filtrar por ID da regra de permissão' },
                        isPublic: { type: 'boolean', description: 'Filtrar por visibilidade pública (true/false)' },
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
                                        username: { type: 'string' },
                                        userDataId: { type: 'string' },
                                        rulesId: { type: 'string' },
                                        isPublic: { type: 'boolean' },
                                        publicTitle: { type: 'string', nullable: true },
                                        createdAt: { type: 'string' },
                                        updatedAt: { type: 'string' },
                                        userData: {
                                            type: 'object',
                                            properties: {
                                                name: { type: 'string' },
                                                email: { type: 'string' },
                                                cpf: { type: 'string',
nullable: true },
                                            },
                                        },
                                        rules: {
                                            type: 'object',
                                            properties: {
                                                name: { type: 'string' },
                                                permissions: {
                                                    type: 'array',
                                                    items: { type: 'string' },
                                                },
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
                    403: { type: 'object',
properties: { error: { type: 'string' } } },
                },
            },
        },
        (req: FastifyRequest, res: FastifyReply) => listUserAdminsController.handle(req, res),
    );

    fastify.post(
        '/admin/users',
        {
            schema: {
                tags: ['Admin — Users'],
                summary: 'Create admin user',
                description: `Creates a new UserAdmin linked to an existing UserData. Requires JWT token with \`CREATE_USER_ADMIN\` permission.

**Business rules:**
- \`userDataId\` must point to an already registered UserData — the admin always represents a real worker
- A UserData can only have one linked UserAdmin (1:1 relationship)
- \`username\` must be unique in the system
- \`userRole\` is the ID of an existing \`Rule\` — that Rule defines what permissions the new admin will have
- To get available Rule IDs, use \`GET /admin/rules\`
- Passwords are stored as bcrypt hash — never in plain text`,
                security: [{ bearerAuth: [] }],
                body: {
                    type: 'object',
                    required: ['username', 'password', 'userDataId', 'userRole'],
                    properties: {
                        username: { type: 'string', example: 'joao.silva' },
                        password: { type: 'string', example: 'senha@Segura123' },
                        userDataId: { type: 'string', description: 'ID of an existing UserData', example: '550e8400-e29b-41d4-a716-446655440000' },
                        userRole: {
                            type: 'string',
                            description: 'ID of the Rule to assign to the admin',
                            example: '550e8400-e29b-41d4-a716-446655440099',
                        },
                    },
                },
                response: {
                    201: {
                        description: 'Admin created successfully',
                        type: 'object',
                        properties: { userAdminId: { type: 'string' } },
                    },
                    400: {
                        description: 'Invalid data',
                        type: 'object',
                        properties: { error: { type: 'string' } },
                    },
                    401: {
                        description: 'Invalid or missing token',
                        type: 'object',
                        properties: { error: { type: 'string' } },
                    },
                    403: {
                        description: 'Missing CREATE_USER_ADMIN permission',
                        type: 'object',
                        properties: { error: { type: 'string' } },
                    },
                    409: {
                        description: 'Username or UserData already in use',
                        type: 'object',
                        properties: { error: { type: 'string' } },
                    },
                },
            },
        },
        (req: FastifyRequest, res: FastifyReply) => createUserAdminController.handle(req, res),
    );

    fastify.patch(
        '/admin/users/:id',
        {
            schema: {
                tags: ['Admin — Users'],
                summary: 'Update admin user',
                security: [{ bearerAuth: [] }],
                params: {
                    type: 'object',
                    properties: { id: { type: 'string' } },
                    required: ['id'],
                },
                body: {
                    type: 'object',
                    properties: {
                        username: { type: 'string' },
                        password: {
                            type: 'string',
                            description: 'Leave empty to keep current password',
                        },
                        rulesId: { type: 'string', description: 'ID of the Rule to assign' },
                        isPublic: { type: 'boolean', description: 'Show this admin on the public contacts page' },
                        publicTitle: { type: 'string', nullable: true, description: 'Title shown on contact page (e.g. Executivo, Estagiário)' },
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
            updateUserAdminController.handle(
                req as Parameters<typeof updateUserAdminController.handle>[0],
                res,
            ),
    );

    fastify.delete(
        '/admin/users/:id',
        {
            schema: {
                tags: ['Admin — Users'],
                summary: 'Delete admin user',
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
            deleteUserAdminController.handle(
                req as Parameters<typeof deleteUserAdminController.handle>[0],
                res,
            ),
    );
}
