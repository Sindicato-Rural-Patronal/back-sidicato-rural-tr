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
import { GetUserDetailController } from '../controllers/get-user-detail.js';
import { GetUserDetailUseCase } from '../../usecase/get-user-detail.js';
import { UpsertUserAddressController } from '../controllers/upsert-user-address.js';
import { UpsertUserAddressUseCase } from '../../usecase/upsert-user-address.js';
import { AddUserRelationController } from '../controllers/add-user-relation.js';
import { AddUserRelationUseCase } from '../../usecase/add-user-relation.js';
import { DeleteUserRelationController } from '../controllers/delete-user-relation.js';
import { DeleteUserRelationUseCase } from '../../usecase/delete-user-relation.js';
import { AddPropertyController } from '../controllers/add-property.js';
import { AddPropertyUseCase } from '../../usecase/add-property.js';
import { DeletePropertyController } from '../controllers/delete-property.js';
import { DeletePropertyUseCase } from '../../usecase/delete-property.js';
import { createAddressAdapter } from '../../adapter/database/address-adapter.js';
import { createUserRelationAdapter } from '../../adapter/database/user-relation-adapter.js';
import { createPropertyAdapter } from '../../adapter/database/property-adapter.js';

export async function userDataRouter(fastify: FastifyInstance, prisma: PrismaClient) {
    const userRepository = createUserDataAdapter(prisma);
    const userAdminRepository = createUserAdminAdapter(prisma);
    const ruleRepository = createRuleAdapter(prisma);
    const addressRepository = createAddressAdapter(prisma);
    const userRelationRepository = createUserRelationAdapter(prisma);
    const propertyRepository = createPropertyAdapter(prisma);
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
    const getUserDetailController = new GetUserDetailController(
        new GetUserDetailUseCase(userRepository),
        getAdminPermissions,
    );
    const upsertUserAddressController = new UpsertUserAddressController(
        new UpsertUserAddressUseCase(userRepository, addressRepository),
        getAdminPermissions,
    );
    const addUserRelationController = new AddUserRelationController(
        new AddUserRelationUseCase(userRepository, userRelationRepository),
        getAdminPermissions,
    );
    const deleteUserRelationController = new DeleteUserRelationController(
        new DeleteUserRelationUseCase(userRelationRepository),
        getAdminPermissions,
    );
    const addPropertyController = new AddPropertyController(
        new AddPropertyUseCase(userRepository, propertyRepository, addressRepository),
        getAdminPermissions,
    );
    const deletePropertyController = new DeletePropertyController(
        new DeletePropertyUseCase(propertyRepository),
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

    fastify.get(
        '/admin/users/:id',
        {
            schema: {
                tags: ['Admin — Users'],
                summary: 'Get worker detail with address, relations and properties',
                security: [{ bearerAuth: [] }],
                params: {
                    type: 'object',
                    properties: { id: { type: 'string' } },
                    required: ['id'],
                },
                response: {
                    200: {
                        type: 'object',
                        description: 'Full UserData with address, relations and properties',
                    },
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
            getUserDetailController.handle(
                req as Parameters<typeof getUserDetailController.handle>[0],
                res,
            ),
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
                        nickname: { type: 'string',
nullable: true },
                        maritalStatus: { type: 'string',
nullable: true },
                        phone2: { type: 'string',
nullable: true },
                        phone3: { type: 'string',
nullable: true },
                        rg: { type: 'string',
nullable: true },
                        rgIssuer: { type: 'string',
nullable: true },
                        rgIssuedAt: { type: 'string',
nullable: true },
                        birthDate: { type: 'string',
nullable: true },
                        driverLicense: { type: 'string',
nullable: true },
                        driverLicenseCategory: { type: 'string',
nullable: true },
                        birthPlace: { type: 'string',
nullable: true },
                        nationality: { type: 'string',
nullable: true },
                        gender: { type: 'string',
nullable: true },
                        ethnicity: { type: 'string',
nullable: true },
                        educationLevel: { type: 'string',
nullable: true },
                        functionalCategory: { type: 'string',
nullable: true },
                        specialNeeds: { type: 'boolean' },
                        memberClassification: { type: 'string',
nullable: true },
                        cadPro: { type: 'string',
nullable: true },
                        familyIncome: { type: 'string',
nullable: true },
                        memberType: { type: 'string',
nullable: true },
                        boardPosition: { type: 'string',
nullable: true },
                        boardMember: { type: 'boolean' },
                        memberStatus: { type: 'string',
nullable: true },
                        memberSince: { type: 'string',
nullable: true },
                        memberNotes: { type: 'string',
nullable: true },
                        memberNotesNumber: { type: 'string',
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

    fastify.put(
        '/admin/users/:id/address',
        {
            schema: {
                tags: ['Admin — Users'],
                summary: 'Upsert address for a worker',
                security: [{ bearerAuth: [] }],
                params: {
                    type: 'object',
                    properties: { id: { type: 'string' } },
                    required: ['id'],
                },
                body: {
                    type: 'object',
                    properties: {
                        type: { type: 'string',
enum: ['URBAN', 'RURAL'] },
                        city: { type: 'string' },
                        state: { type: 'string' },
                        zipCode: { type: 'string' },
                        complement: { type: 'string' },
                        notes: { type: 'string' },
                        street: { type: 'string' },
                        number: { type: 'string' },
                        neighborhood: { type: 'string' },
                        localityName: { type: 'string' },
                        road: { type: 'string' },
                        km: { type: 'string' },
                        lot: { type: 'string' },
                        section: { type: 'string' },
                    },
                },
                response: {
                    200: { type: 'object',
properties: { addressId: { type: 'string' } } },
                    400: { type: 'object',
properties: { error: { type: 'string' } } },
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
            upsertUserAddressController.handle(
                req as Parameters<typeof upsertUserAddressController.handle>[0],
                res,
            ),
    );

    fastify.post(
        '/admin/users/:id/relations',
        {
            schema: {
                tags: ['Admin — Users'],
                summary: 'Link two worker records as related',
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
                        targetId: { type: 'string',
example: 'uuid-of-other-user' },
                        label: { type: 'string',
example: 'spouse' },
                    },
                },
                response: {
                    201: { type: 'object',
properties: { id: { type: 'string' } } },
                    400: { type: 'object',
properties: { error: { type: 'string' } } },
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
            addUserRelationController.handle(
                req as Parameters<typeof addUserRelationController.handle>[0],
                res,
            ),
    );

    fastify.delete(
        '/admin/users/:id/relations/:relationId',
        {
            schema: {
                tags: ['Admin — Users'],
                summary: 'Remove a relation between two workers',
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
            deleteUserRelationController.handle(
                req as Parameters<typeof deleteUserRelationController.handle>[0],
                res,
            ),
    );

    fastify.post(
        '/admin/users/:id/properties',
        {
            schema: {
                tags: ['Admin — Users'],
                summary: 'Add a property (rural land) to a worker',
                security: [{ bearerAuth: [] }],
                params: {
                    type: 'object',
                    properties: { id: { type: 'string' } },
                    required: ['id'],
                },
                body: {
                    type: 'object',
                    required: ['name'],
                    properties: {
                        name: { type: 'string',
example: 'Fazenda São João' },
                        registration: { type: 'string',
example: '12345-6' },
                        address: {
                            type: 'object',
                            properties: {
                                type: { type: 'string',
enum: ['URBAN', 'RURAL'] },
                                city: { type: 'string' },
                                state: { type: 'string' },
                                zipCode: { type: 'string' },
                                localityName: { type: 'string' },
                                road: { type: 'string' },
                                km: { type: 'string' },
                                lot: { type: 'string' },
                                section: { type: 'string' },
                            },
                        },
                    },
                },
                response: {
                    201: { type: 'object',
properties: { id: { type: 'string' } } },
                    400: { type: 'object',
properties: { error: { type: 'string' } } },
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
            addPropertyController.handle(
                req as Parameters<typeof addPropertyController.handle>[0],
                res,
            ),
    );

    fastify.delete(
        '/admin/users/:id/properties/:propertyId',
        {
            schema: {
                tags: ['Admin — Users'],
                summary: 'Delete a property from a worker',
                security: [{ bearerAuth: [] }],
                params: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' },
                        propertyId: { type: 'string' },
                    },
                    required: ['id', 'propertyId'],
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
            deletePropertyController.handle(
                req as Parameters<typeof deletePropertyController.handle>[0],
                res,
            ),
    );
}
