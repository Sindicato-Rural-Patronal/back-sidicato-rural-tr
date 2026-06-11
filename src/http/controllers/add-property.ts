import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AddPropertyUseCase, AddPropertyRequest } from '../../usecase/add-property.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { requirePermission, errorToStatus } from '../lib/require-permission.js';

type Body = Omit<AddPropertyRequest, 'userDataId'>;

export class AddPropertyController {
    constructor(
        private readonly useCase: AddPropertyUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    async handle(
        request: FastifyRequest<{
 Params: { id: string };
Body: Body 
}>,
        reply: FastifyReply,
    ) {
        if (
            (await requirePermission(request, reply, 'UPDATE_USER', this.getAdminPermissions)) ===
            null
        )
            return;

        const { id } = request.params;
        const body = request.body;
        const result = await this.useCase.execute({ userDataId: id,
...body });
        if (result.error) {
            return reply.status(errorToStatus(result.error)).send({ error: result.error.message });
        }
        return reply.status(201).send({ id: result.property?.id });
    }
}
