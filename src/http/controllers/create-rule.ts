import { FastifyRequest, FastifyReply } from 'fastify';
import { CreateRuleUseCase } from '../../usecase/create-rule.js';
import { permitions } from '../../generated/prisma/enums.js';

export class CreateRuleController {
    constructor(private createRuleUseCase: CreateRuleUseCase) {}

    async handle(request: FastifyRequest, reply: FastifyReply) {
        const { name, permitions: perms, description } = request.body as {
            name: string;
            permitions: permitions[];
            description?: string;
        };
        const response = await this.createRuleUseCase.execute({ name, permitions: perms, description });
        if (!response.success) {
            return reply.status(400).send({ error: response.error?.message });
        }
        return reply.status(201).send(response.rule);
    }
}
