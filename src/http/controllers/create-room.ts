import type { FastifyRequest, FastifyReply } from 'fastify';
import type { CreateRoomUseCase } from '../../usecase/create-room.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { requirePermission } from '../lib/require-permission.js';

type CreateRoomBody = {
    name: string;
    description: string;
    maxCapacity: number;
};

export class CreateRoomController {
    constructor(
        private readonly useCase: CreateRoomUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    async handle(request: FastifyRequest, reply: FastifyReply) {
        if (
            (await requirePermission(request, reply, 'CREATE_COURSE', this.getAdminPermissions)) ===
            null
        )
            return;
        const body = request.body as CreateRoomBody;
        const response = await this.useCase.execute(body);
        if (response.error) return reply.status(400).send({ error: response.error?.message });
        return reply.status(201).send({ id: response.roomId });
    }
}
