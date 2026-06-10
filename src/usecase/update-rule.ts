import z from 'zod';
import type { RuleRepository } from '../ports/external/rule-repository.js';
import { permitions } from '../generated/prisma/browser.js';
import { ValidationError } from '../errors/validation.js';
import { RuleNotFoundError } from '../errors/not-found.js';

export const updateRuleRequestSchema = z.object({
    ruleId: z.string().min(1),
    name: z.string().min(1).optional(),
    permitions: z.array(z.enum(permitions)).min(1).optional(),
    description: z.string().optional(),
});
export type UpdateRuleRequest = z.infer<typeof updateRuleRequestSchema>;

export class UpdateRuleUseCase {
    constructor(private ruleRepository: RuleRepository) {}

    async execute(request: UpdateRuleRequest) {
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

        const updated = await this.ruleRepository.update(request.ruleId, {
            name: request.name,
            permitions: request.permitions,
            description: request.description,
        });

        return { rule: updated };
    }
}
