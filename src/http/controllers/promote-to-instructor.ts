import type { FastifyRequest, FastifyReply } from 'fastify';
import type { PromoteToInstructorUseCase } from '../../usecase/promote-to-instructor.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { requirePermission, errorToStatus } from '../lib/require-permission.js';

type Body = { bio?: string; linkedin?: string; instagram?: string; facebook?: string };

export class PromoteToInstructorController {
    constructor(
        private readonly useCase: PromoteToInstructorUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    async handle(
        request: FastifyRequest<{ Params: { id: string }; Body: Body }>,
        reply: FastifyReply,
    ) {
        if (
            (await requirePermission(request, reply, 'UPDATE_USER', this.getAdminPermissions)) ===
            null
        )
            return;

        const { id } = request.params;
        const { bio, linkedin, instagram, facebook } = request.body ?? {};
        const result = await this.useCase.execute({ userDataId: id, bio, linkedin, instagram, facebook });
        if (result.error) {
            return reply.status(errorToStatus(result.error)).send({ error: result.error.message });
        }
        return reply.status(201).send({ instructorId: result.instructorId });
    }
}
