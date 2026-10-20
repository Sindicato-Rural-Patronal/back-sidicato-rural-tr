import type { FastifyRequest, FastifyReply } from 'fastify';
import type { CreateRuleUseCase } from '../../usecase/create-rule.js';
import type { Permission } from '../../generated/prisma/enums.js';
import { errorToStatus } from '../lib/require-permission.js';
import { adminOf } from '../lib/route-auth.js';

export class CreateRuleController {
    constructor(
        private readonly createRuleUseCase: CreateRuleUseCase,
    ) {}

    async handle(request: FastifyRequest, reply: FastifyReply) {
        const actorPerms = [...adminOf(request).permissions];
        const {
            name,
            permissions: perms,
            description,
        } = request.body as {
            name: string;
            permissions: Permission[];
            description?: string;
        };
        const response = await this.createRuleUseCase.execute({
            name,
            permissions: perms,
            description,
        }, actorPerms);
        if (response.error) return reply.status(errorToStatus(response.error)).send({ error: response.error?.message });
        return reply.status(201).send(response.rule);
    }
}
