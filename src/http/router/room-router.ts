import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client/extension';
import { createRoomAdapter } from '../../adapter/database/room-adapter.js';
import { createUserAdminAdapter } from '../../adapter/database/user-admin-adapter.js';
import { createRuleAdapter } from '../../adapter/database/rule-adapter.js';
import { CreateRoomController } from '../controllers/create-room.js';
import { CreateRoomUseCase } from '../../usecase/create-room.js';
import { ListRoomsController } from '../controllers/list-rooms.js';
import { ListRoomsUseCase } from '../../usecase/list-rooms.js';
import { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';

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
                response: {
                    200: {
                        type: 'array',
                        items: { type: 'object',
properties: roomProperties },
                    },
                },
            },
        },
        (req: FastifyRequest, res: FastifyReply) => listRoomsController.handle(req, res),
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
                        name: { type: 'string' },
                        description: { type: 'string' },
                        maxCapacity: { type: 'integer',
minimum: 1 },
                    },
                },
                response: {
                    201: { type: 'object',
properties: { id: { type: 'string' } } },
                    400: { type: 'object',
properties: { error: { type: 'string' } } },
                    403: { type: 'object',
properties: { error: { type: 'string' } } },
                },
            },
        },
        (req: FastifyRequest, res: FastifyReply) => createRoomController.handle(req, res),
    );
}
