import type { FastifyRequest, FastifyReply } from 'fastify';
import type { DeleteRuleUseCase } from '../../usecase/delete-rule.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { requirePermission, errorToStatus } from '../lib/require-permission.js';

export class DeleteRuleController {
    constructor(
        private readonly deleteRuleUseCase: DeleteRuleUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    async handle(request: FastifyRequest<{ Params: { ruleId: string } }>, reply: FastifyReply) {
        if ((await requirePermission(request, reply, 'DELETE_RULE', this.getAdminPermissions)) === null)
            return;
        const response = await this.deleteRuleUseCase.execute(request.params.ruleId);
        if (response.error) {
            return reply.status(errorToStatus(response.error)).send({ error: response.error.message });
        }
        return reply.status(204).send();
    }
}
