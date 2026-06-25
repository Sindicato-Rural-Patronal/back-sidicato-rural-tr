import type { FastifyRequest, FastifyReply } from 'fastify';
import type { UpdateUserDataUseCase, UpdateUserDataRequest } from '../../usecase/update-user-data.js';
import type { UpdateInstructorUseCase } from '../../usecase/update-instructor.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { requirePermission, errorToStatus } from '../lib/require-permission.js';
import { InstructorNotFoundError } from '../../errors/not-found.js';

type InstructorFields = {
    bio?: string | null;
    linkedin?: string | null;
    instagram?: string | null;
    facebook?: string | null;
};

type Body = Omit<UpdateUserDataRequest, 'userId'> & InstructorFields;

export class UpdateUserController {
    constructor(
        private readonly useCase: UpdateUserDataUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
        private readonly updateInstructorUseCase?: UpdateInstructorUseCase,
    ) {}

    async handle(
        request: FastifyRequest<{
            Params: { id: string };
            Body: Body;
        }>,
        reply: FastifyReply,
    ) {
        if (
            (await requirePermission(request, reply, 'UPDATE_USER', this.getAdminPermissions)) ===
            null
        )
            return;

        const { id } = request.params;
        const { bio, linkedin, instagram, facebook, ...userBody } = request.body;

        const result = await this.useCase.execute({ ...userBody,
userId: id });
        if (result.error) {
            return reply.status(errorToStatus(result.error)).send({ error: result.error?.message });
        }

        const hasInstructorFields =
            bio !== undefined ||
            linkedin !== undefined ||
            instagram !== undefined ||
            facebook !== undefined;

        if (hasInstructorFields && this.updateInstructorUseCase) {
            const instructorResult = await this.updateInstructorUseCase.execute({
                userDataId: id,
                bio,
                linkedin,
                instagram,
                facebook,
            });
            if (
                instructorResult.error &&
                !(instructorResult.error instanceof InstructorNotFoundError)
            ) {
                return reply
                    .status(errorToStatus(instructorResult.error))
                    .send({ error: instructorResult.error.message });
            }
        }

        return reply.status(200).send({ message: 'User updated successfully' });
    }
}
