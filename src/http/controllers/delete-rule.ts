import type { FastifyRequest, FastifyReply } from 'fastify';
import type { DeleteRuleUseCase } from '../../usecase/delete-rule.js';
import { errorToStatus } from '../lib/require-permission.js';

export class DeleteRuleController {
    constructor(
        private readonly deleteRuleUseCase: DeleteRuleUseCase,
    ) {}

    async handle(request: FastifyRequest<{ Params: { ruleId: string } }>, reply: FastifyReply) {
        const response = await this.deleteRuleUseCase.execute(request.params.ruleId);
        if (response.error) {
            return reply.status(errorToStatus(response.error)).send({ error: response.error.message });
        }
        return reply.status(204).send();
    }
}
