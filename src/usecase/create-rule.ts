import z from 'zod';
import type { RuleRepository } from '../ports/external/rule-repository.js';
import { Permission } from '../generated/prisma/browser.js';
import { ValidationError } from '../errors/validation.js';

export const createRuleRequestSchema = z.object({
    name: z.string().min(1, 'Rule name is required'),
    permissions: z.array(z.enum(Permission)).min(1, 'At least one permission is required'),
    description: z.string().optional(),
});
export type CreateRuleRequest = z.infer<typeof createRuleRequestSchema>;

export type CreateRuleResponse = {
    error?: Error;
    rule?: {
        name: string;
        permissions: Permission[];
        id: string;
        description: string;
        createdAt: Date;
        updatedAt: Date;
    };
};

export class CreateRuleUseCase {
    constructor(private ruleRepository: RuleRepository) {}

    async execute(request: CreateRuleRequest): Promise<CreateRuleResponse> {
        console.log(
            `[CreateRule] name="${request.name}" permissions=${JSON.stringify(request.permissions)}`,
        );
        const validationResult = createRuleRequestSchema.safeParse(request);
        if (!validationResult.success) {
            const errorMessage = validationResult.error.issues.map(e => e.message).join(', ');
            return { error: new ValidationError(errorMessage) };
        }

        const rule = await this.ruleRepository.create({
            name: request.name,
            permissions: request.permissions,
            description: request.description,
        });
        console.log(`[CreateRule] success ruleId="${rule.id}"`);
        return {
            rule: {
                name: rule.name,
                permissions: rule.permissions,
                id: rule.id,
                description: rule.description,
                createdAt: rule.createdAt,
                updatedAt: rule.updatedAt,
            },
        };
    }
}
