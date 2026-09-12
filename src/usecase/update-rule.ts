import z from 'zod';
import type { RuleRepository } from '../ports/external/rule-repository.js';
import { Permission } from '../generated/prisma/browser.js';
import { ValidationError } from '../errors/validation.js';
import { ForbiddenError } from '../errors/auth.js';
import { RuleNotFoundError } from '../errors/not-found.js';

export const updateRuleRequestSchema = z.object({
    ruleId: z.string().min(1),
    name: z.string().min(1).optional(),
    permissions: z.array(z.enum(Permission)).min(1).optional(),
    description: z.string().optional(),
});
export type UpdateRuleRequest = z.infer<typeof updateRuleRequestSchema>;

export class UpdateRuleUseCase {
    constructor(private ruleRepository: RuleRepository) {}

    async execute(request: UpdateRuleRequest, actorPermissions: string[] = []) {
        const validation = updateRuleRequestSchema.safeParse(request);
        if (!validation.success) {
            return {
                error: new ValidationError(validation.error.issues.map(e => e.message).join(', ')),
            };
        }

        const rule = await this.ruleRepository.findById(request.ruleId);
        if (!rule) {
            return { error: new RuleNotFoundError() };
        }

        // Anti-escalonamento: não incluir na regra permissões além das do ator.
        if (request.permissions) {
            const escalates = request.permissions.some(p => !actorPermissions.includes(p));
            if (escalates) {
                return { error: new ForbiddenError('Você não pode conceder permissões além das suas.') };
            }
        }

        const updated = await this.ruleRepository.update(request.ruleId, {
            name: request.name,
            permissions: request.permissions,
            description: request.description,
        });

        return { rule: updated };
    }
}
