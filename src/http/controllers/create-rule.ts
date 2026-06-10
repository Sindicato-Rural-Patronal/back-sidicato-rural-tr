import type { FastifyRequest, FastifyReply } from 'fastify';
import type { CreateRuleUseCase } from '../../usecase/create-rule.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import type { permitions } from '../../generated/prisma/enums.js';
import { requirePermission } from '../lib/require-permission.js';

export class CreateRuleController {
    constructor(
        private readonly createRuleUseCase: CreateRuleUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    async handle(request: FastifyRequest, reply: FastifyReply) {
        if (
            (await requirePermission(request, reply, 'CREATE_RULE', this.getAdminPermissions)) ===
            null
        )
            return;
        const {
            name,
            permitions: perms,
            description,
        } = request.body as {
            name: string;
            permitions: permitions[];
            description?: string;
        };
        const response = await this.createRuleUseCase.execute({
            name,
            permitions: perms,
            description,
        });
        if (response.error) return reply.status(400).send({ error: response.error?.message });
        return reply.status(201).send(response.rule);
    }
}
