import { FastifyRequest, FastifyReply } from 'fastify';
import { UpdateRuleUseCase } from '../../usecase/update-rule.js';
import { permitions } from '../../generated/prisma/enums.js';

export class UpdateRuleController {
    constructor(private updateRuleUseCase: UpdateRuleUseCase) {}

    async handle(request: FastifyRequest<{ Params: { ruleId: string } }>, reply: FastifyReply) {
        const { ruleId } = request.params;
        const { name, permitions: perms, description } = request.body as {
            name?: string;
            permitions?: permitions[];
            description?: string;
        };
        const token = request.headers.authorization?.replace('Bearer ', '') ?? '';

        const response = await this.updateRuleUseCase.execute({ ruleId, name, permitions: perms, description, token });

        if (!response.success) {
            if (response.statusCode === 401) return reply.status(401).send({ error: response.error?.message });
            if (response.forbidden) return reply.status(403).send({ error: response.error?.message });
            if (response.notFound) return reply.status(404).send({ error: response.error?.message });
            return reply.status(400).send({ error: response.error?.message });
        }
        return reply.status(200).send({ message: 'Rule updated successfully' });
    }
}
