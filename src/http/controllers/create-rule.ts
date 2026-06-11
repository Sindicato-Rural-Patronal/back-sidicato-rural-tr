import type { FastifyRequest, FastifyReply } from 'fastify';
import type { CreateRuleUseCase } from '../../usecase/create-rule.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import type { Permission } from '../../generated/prisma/enums.js';
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
        });
        if (response.error) return reply.status(400).send({ error: response.error?.message });
        return reply.status(201).send(response.rule);
    }
}
