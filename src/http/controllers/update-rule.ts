import type { FastifyRequest, FastifyReply } from 'fastify';
import type { UpdateRuleUseCase } from '../../usecase/update-rule.js';
import type { Permission } from '../../generated/prisma/enums.js';
import { errorToStatus } from '../lib/require-permission.js';
import { adminOf } from '../lib/route-auth.js';

export class UpdateRuleController {
    constructor(
        private readonly updateRuleUseCase: UpdateRuleUseCase,
    ) {}

    async handle(request: FastifyRequest<{ Params: { ruleId: string } }>, reply: FastifyReply) {
        const actorPerms = [...adminOf(request).permissions];
        const { ruleId } = request.params;
        const {
            name,
            permissions: perms,
            description,
        } = request.body as {
            name?: string;
            permissions?: Permission[];
            description?: string;
        };
        const response = await this.updateRuleUseCase.execute({
            ruleId,
            name,
            permissions: perms,
            description,
        }, actorPerms);
        if (response.error) {
            return reply
                .status(errorToStatus(response.error))
                .send({ error: response.error?.message });
        }
        return reply.status(200).send({ message: 'Rule updated successfully' });
    }
}
