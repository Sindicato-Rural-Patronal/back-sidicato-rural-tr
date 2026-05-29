import z from "zod";
import { RuleRepository } from "../ports/external/rule-repository";
import { permitions } from "../generated/prisma/browser";
import { describe } from "zod/v4/core";


export const createRuleRequestSchema = z.object({
    name: z.string().min(1, 'Rule name is required'),
    permitions: z.array(z.enum(permitions)).min(1, 'At least one permission is required'),
    description: z.string().optional(),
});
export type CreateRuleRequest = z.infer<typeof createRuleRequestSchema>

export type CreateRuleResponse = {
    success: boolean;
    error?: Error;
    rule?: {
         name: string;
    permitions: permitions[];
    id: string;
    description: string;
    createdAt: Date;
    updatedAt: Date;
    }
}
export class CreateRuleUseCase {
    constructor(private ruleRepository: RuleRepository) {}


    async execute(request: CreateRuleRequest): Promise<CreateRuleResponse> {

        // validate
        const validationResult = createRuleRequestSchema.safeParse(request);
        if (!validationResult.success) {
            const errorMessage = validationResult.error.issues.map(e => e.message).join(', ');
            return {
                success: false,
                error: new Error(errorMessage),
            };
        }
        const rule = await this.ruleRepository.create({
            name: request.name,
            permitions: request.permitions,
            description: request.description,
        });
        return { success: true , rule: {
            name: rule.name,
            permitions: rule.permitions,
            id: rule.id,
            description: rule.description,
            createdAt: rule.createdAt,
            updatedAt: rule.updatedAt,
        }
        };
    }
}