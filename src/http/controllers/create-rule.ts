import type { FastifyRequest, FastifyReply } from 'fastify';
import type { CreateRuleUseCase } from '../../usecase/create-rule.js';
import type { permitions } from '../../generated/prisma/enums.js';

export class CreateRuleController {
    constructor(private createRuleUseCase: CreateRuleUseCase) {}

    async handle(request: FastifyRequest, reply: FastifyReply) {
        const token = request.headers.authorization?.replace('Bearer ', '') ?? '';
        const { name, permitions: perms, description } = request.body as {
            name: string;
            permitions: permitions[];
            description?: string;
        };
        const response = await this.createRuleUseCase.execute({ name, permitions: perms, description, token });
        if (!response.success) {
            return reply.status(response.statusCode ?? 400).send({ error: response.error?.message });
        }
        return reply.status(201).send(response.rule);
    }
}
