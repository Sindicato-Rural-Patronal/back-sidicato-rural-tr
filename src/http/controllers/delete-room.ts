import type { FastifyRequest, FastifyReply } from 'fastify';
import type { DeleteRoomUseCase } from '../../usecase/delete-room.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { requirePermission, errorToStatus } from '../lib/require-permission.js';

export class DeleteRoomController {
    constructor(
        private readonly useCase: DeleteRoomUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    async handle(request: FastifyRequest<{ Params: { roomId: string } }>, reply: FastifyReply) {
        if (
            (await requirePermission(request, reply, 'DELETE_COURSE', this.getAdminPermissions)) === null
        )
            return;
        const response = await this.useCase.execute(request.params.roomId);
        if (response.error) {
            return reply.status(errorToStatus(response.error)).send({ error: response.error.message });
        }
        return reply.status(204).send();
    }
}
