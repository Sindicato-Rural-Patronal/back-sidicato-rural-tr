import type { FastifyRequest, FastifyReply } from 'fastify';
import type { UpdateRuleUseCase } from '../../usecase/update-rule.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import type { permitions } from '../../generated/prisma/enums.js';
import { requirePermission, errorToStatus } from '../lib/require-permission.js';

export class UpdateRuleController {
    constructor(
        private readonly updateRuleUseCase: UpdateRuleUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    async handle(request: FastifyRequest<{ Params: { ruleId: string } }>, reply: FastifyReply) {
        if (
            (await requirePermission(request, reply, 'UPDATE_RULE', this.getAdminPermissions)) ===
            null
        )
            return;
        const { ruleId } = request.params;
        const {
            name,
            permitions: perms,
            description,
        } = request.body as {
            name?: string;
            permitions?: permitions[];
            description?: string;
        };
        const response = await this.updateRuleUseCase.execute({
            ruleId,
            name,
            permitions: perms,
            description,
        });
        if (response.error) {
            return reply
                .status(errorToStatus(response.error))
                .send({ error: response.error?.message });
        }
        return reply.status(200).send({ message: 'Rule updated successfully' });
    }
}
