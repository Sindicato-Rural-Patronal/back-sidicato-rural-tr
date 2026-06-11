import type { FastifyRequest, FastifyReply } from 'fastify';
import type {
    UpsertUserAddressUseCase,
    UpsertUserAddressRequest,
} from '../../usecase/upsert-user-address.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { requirePermission, errorToStatus } from '../lib/require-permission.js';

type Body = Omit<UpsertUserAddressRequest, 'userId'>;

export class UpsertUserAddressController {
    constructor(
        private readonly useCase: UpsertUserAddressUseCase,
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
        const result = await this.useCase.execute({ userId: id,
...body });
        if (result.error) {
            return reply.status(errorToStatus(result.error)).send({ error: result.error.message });
        }
        return reply.status(200).send({ addressId: result.addressId });
    }
}
