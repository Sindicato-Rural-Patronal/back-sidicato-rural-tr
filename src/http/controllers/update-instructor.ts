import type { FastifyRequest, FastifyReply } from 'fastify';
import type { UpdateInstructorUseCase } from '../../usecase/update-instructor.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { requirePermission, errorToStatus } from '../lib/require-permission.js';

type Body = {
    bio?: string | null;
    linkedin?: string | null;
    instagram?: string | null;
    facebook?: string | null;
};

export class UpdateInstructorController {
    constructor(
        private readonly useCase: UpdateInstructorUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    async handle(
        request: FastifyRequest<{ Params: { id: string }; Body: Body }>,
        reply: FastifyReply,
    ) {
        if ((await requirePermission(request, reply, 'UPDATE_USER', this.getAdminPermissions)) === null)
            return;

        const { id } = request.params;
        const { bio, linkedin, instagram, facebook } = request.body ?? {};
        const result = await this.useCase.execute({ userDataId: id, bio, linkedin, instagram, facebook });
        if (result.error) {
            return reply.status(errorToStatus(result.error)).send({ error: result.error.message });
        }
        return reply.status(200).send({ message: 'Instructor updated' });
    }
}
