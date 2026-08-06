import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client/extension';
import { createRoomAdapter } from '../../adapter/database/room-adapter.js';
import { createUserAdminAdapter } from '../../adapter/database/user-admin-adapter.js';
import { createRuleAdapter } from '../../adapter/database/rule-adapter.js';
import { CreateRoomController } from '../controllers/create-room.js';
import { CreateRoomUseCase } from '../../usecase/create-room.js';
import { ListRoomsController } from '../controllers/list-rooms.js';
import { ListRoomsUseCase } from '../../usecase/list-rooms.js';
import { UpdateRoomController } from '../controllers/update-room.js';
import { UpdateRoomUseCase } from '../../usecase/update-room.js';
import { DeleteRoomController } from '../controllers/delete-room.js';
import { DeleteRoomUseCase } from '../../usecase/delete-room.js';
import { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { errorResponse, paginationQuerystring, pagedResponse } from '../lib/swagger-schemas.js';

const roomProperties = {
    id: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string' },
    maxCapacity: { type: 'integer' },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
};

export async function roomRouter(fastify: FastifyInstance, prisma: PrismaClient) {
    const roomRepository = createRoomAdapter(prisma);
    const userAdminRepository = createUserAdminAdapter(prisma);
    const ruleRepository = createRuleAdapter(prisma);
    const getAdminPermissions = new GetAdminPermissionsUseCase(userAdminRepository, ruleRepository);

    const createRoomController = new CreateRoomController(
        new CreateRoomUseCase(roomRepository),
        getAdminPermissions,
    );
    const listRoomsController = new ListRoomsController(new ListRoomsUseCase(roomRepository));
    const updateRoomController = new UpdateRoomController(
        new UpdateRoomUseCase(roomRepository),
        getAdminPermissions,
    );
    const deleteRoomController = new DeleteRoomController(
        new DeleteRoomUseCase(roomRepository),
        getAdminPermissions,
    );

    fastify.get(
        '/rooms',
        {
            schema: {
                tags: ['Rooms'],
                summary: 'List rooms',
                description: `Returns all registered rooms, ordered by name.

**Business rules:**
- Public route — no authentication required
- The \`maxCapacity\` field of each room determines the maximum number of enrollments for any course held in it
- Use this route to populate the room selector in the course creation form`,
                querystring: paginationQuerystring,
                response: {
                    200: pagedResponse({ type: 'object',
properties: roomProperties }),
                },
            },
        },
        (
            req: FastifyRequest<{
 Querystring: {
 page?: number;
limit?: number 
} 
}>,
            res: FastifyReply,
        ) => listRoomsController.handle(req, res),
    );

    fastify.post(
        '/rooms',
        {
            schema: {
                tags: ['Rooms'],
                summary: 'Create room',
                description: `Creates a new physical room where courses will be held. Requires JWT token with \`CREATE_COURSE\` permission.

**Business rules:**
- \`maxCapacity\` sets the absolute enrollment limit for any course allocated to this room
- The same room cannot have two courses with overlapping periods (validated in \`POST /courses\`)
- A course cannot be created without specifying a registered room`,
                security: [{ bearerAuth: [] }],
                body: {
                    type: 'object',
                    required: ['name', 'description', 'maxCapacity'],
                    properties: {
                        name: { type: 'string',
example: 'Sala A' },
                        description: { type: 'string',
example: 'Auditório principal com projetor e ar-condicionado.' },
                        maxCapacity: { type: 'integer',
minimum: 1,
example: 40 },
                    },
                },
                response: {
                    201: { type: 'object',
properties: { id: { type: 'string' } } },
                    400: errorResponse,
                    401: errorResponse,
                    403: errorResponse,
                },
            },
        },
        (req: FastifyRequest, res: FastifyReply) => createRoomController.handle(req, res),
    );

    fastify.patch(
        '/rooms/:roomId',
        {
            schema: {
                tags: ['Rooms'],
                summary: 'Update room',
                description: 'Atualiza nome, descrição e capacidade da sala. Requer permissão `UPDATE_COURSE`.',
                security: [{ bearerAuth: [] }],
                params: {
                    type: 'object',
                    required: ['roomId'],
                    properties: { roomId: { type: 'string' } },
                },
                body: {
                    type: 'object',
                    required: ['name', 'description', 'maxCapacity'],
                    properties: {
                        name: { type: 'string',
example: 'Sala A' },
                        description: { type: 'string' },
                        maxCapacity: { type: 'integer',
minimum: 1,
example: 40 },
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
        (
            req: FastifyRequest<{
                Params: { roomId: string };
                Body: { name: string; description: string; maxCapacity: number };
            }>,
            res: FastifyReply,
        ) => updateRoomController.handle(req, res),
    );

    fastify.delete(
        '/rooms/:roomId',
        {
            schema: {
                tags: ['Rooms'],
                summary: 'Delete room',
                description:
                    'Remove a sala. Falha com 409 se houver cursos vinculados. Requer permissão `DELETE_COURSE`.',
                security: [{ bearerAuth: [] }],
                params: {
                    type: 'object',
                    required: ['roomId'],
                    properties: { roomId: { type: 'string' } },
                },
                response: {
                    204: { type: 'null' },
                    401: errorResponse,
                    403: errorResponse,
                    404: errorResponse,
                    409: errorResponse,
                },
            },
        },
        (req: FastifyRequest<{ Params: { roomId: string } }>, res: FastifyReply) =>
            deleteRoomController.handle(req, res),
    );
}
