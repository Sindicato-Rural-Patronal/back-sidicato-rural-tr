import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client/extension';
import { createUserDataAdapter } from '../../adapter/database/user-data.js';
import { createPropertyAdapter } from '../../adapter/database/property-adapter.js';
import { createAddressAdapter } from '../../adapter/database/address-adapter.js';
import { createUserAdminAdapter } from '../../adapter/database/user-admin-adapter.js';
import { createRuleAdapter } from '../../adapter/database/rule-adapter.js';
import { AddPropertyUseCase } from '../../usecase/add-property.js';
import { DeletePropertyUseCase } from '../../usecase/delete-property.js';
import { ListUserPropertiesUseCase } from '../../usecase/list-user-properties.js';
import { AddPropertyController } from '../controllers/add-property.js';
import { DeletePropertyController } from '../controllers/delete-property.js';
import { ListUserPropertiesController } from '../controllers/list-user-properties.js';
import { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';

export async function userPropertyRouter(fastify: FastifyInstance, prisma: PrismaClient) {
    const userDataRepository = createUserDataAdapter(prisma);
    const propertyRepository = createPropertyAdapter(prisma);
    const addressRepository = createAddressAdapter(prisma);
    const userAdminRepository = createUserAdminAdapter(prisma);
    const ruleRepository = createRuleAdapter(prisma);
    const getAdminPermissions = new GetAdminPermissionsUseCase(userAdminRepository, ruleRepository);

    const listUserPropertiesController = new ListUserPropertiesController(
        new ListUserPropertiesUseCase(propertyRepository),
        getAdminPermissions,
    );
    const addPropertyController = new AddPropertyController(
        new AddPropertyUseCase(userDataRepository, propertyRepository, addressRepository),
        getAdminPermissions,
    );
    const deletePropertyController = new DeletePropertyController(
        new DeletePropertyUseCase(propertyRepository),
        getAdminPermissions,
    );

    fastify.get(
        '/admin/users/:id/properties',
        {
            schema: {
                tags: ['Admin — Properties'],
                summary: 'List properties of a worker',
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
                                        name: { type: 'string' },
                                        registration: { type: 'string', nullable: true },
                                        address: {
                                            type: 'object',
                                            nullable: true,
                                            properties: {
                                                id: { type: 'string' },
                                                type: { type: 'string' },
                                                city: { type: 'string', nullable: true },
                                                state: { type: 'string', nullable: true },
                                                zipCode: { type: 'string', nullable: true },
                                                street: { type: 'string', nullable: true },
                                                number: { type: 'string', nullable: true },
                                                neighborhood: { type: 'string', nullable: true },
                                                complement: { type: 'string', nullable: true },
                                                notes: { type: 'string', nullable: true },
                                                localityName: { type: 'string', nullable: true },
                                                road: { type: 'string', nullable: true },
                                                km: { type: 'string', nullable: true },
                                                lot: { type: 'string', nullable: true },
                                                section: { type: 'string', nullable: true },
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
            listUserPropertiesController.handle(
                req as Parameters<typeof listUserPropertiesController.handle>[0],
                res,
            ),
    );

    fastify.post(
        '/admin/users/:id/properties',
        {
            schema: {
                tags: ['Admin — Properties'],
                summary: 'Add a property (rural land) to a worker',
                security: [{ bearerAuth: [] }],
                params: {
                    type: 'object',
                    properties: { id: { type: 'string' } },
                    required: ['id'],
                },
                body: {
                    type: 'object',
                    required: ['name', 'address'],
                    properties: {
                        name: { type: 'string', example: 'Fazenda São João' },
                        registration: { type: 'string', example: 'MAT-2026-123' },
                        address: {
                            type: 'object',
                            properties: {
                                type: { type: 'string', enum: ['URBAN', 'RURAL'], example: 'RURAL' },
                                city: { type: 'string', example: 'Terra Roxa' },
                                state: { type: 'string', example: 'PR' },
                                zipCode: { type: 'string', example: '85990-000' },
                                complement: { type: 'string', example: 'Próximo ao rio' },
                                notes: { type: 'string', example: 'Acesso pela estrada de chão após o trevo.' },
                                street: { type: 'string', example: 'Linha Progresso' },
                                number: { type: 'string', example: 's/n' },
                                neighborhood: { type: 'string', example: 'Zona Rural' },
                                localityName: { type: 'string', example: 'Vila Nova' },
                                road: { type: 'string', example: 'PR-182' },
                                km: { type: 'string', example: '12' },
                                lot: { type: 'string', example: '04' },
                                section: { type: 'string', example: 'B' },
                            },
                        },
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
            addPropertyController.handle(
                req as Parameters<typeof addPropertyController.handle>[0],
                res,
            ),
    );

    fastify.delete(
        '/admin/users/:id/properties/:propertyId',
        {
            schema: {
                tags: ['Admin — Properties'],
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
                    401: { type: 'object', properties: { error: { type: 'string' } } },
                    403: { type: 'object', properties: { error: { type: 'string' } } },
                    404: { type: 'object', properties: { error: { type: 'string' } } },
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
