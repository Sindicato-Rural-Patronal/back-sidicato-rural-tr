import z from "zod";
import type { RuleRepository } from "../ports/external/rule-repository.js";
import type { UserAdminRepository } from "../ports/external/user-admin-repository.js";
import { permitions } from "../generated/prisma/browser.js";
import { verifyPermission } from "../lib/verify-permission.js";


export const createRuleRequestSchema = z.object({
    name: z.string().min(1, 'Rule name is required'),
    permitions: z.array(z.enum(permitions)).min(1, 'At least one permission is required'),
    description: z.string().optional(),
    token: z.string().min(1, 'Token is required'),
});
export type CreateRuleRequest = z.infer<typeof createRuleRequestSchema>

export type CreateRuleResponse = {
    success: boolean;
    statusCode?: number;
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
    constructor(
        private ruleRepository: RuleRepository,
        private userAdminRepository: UserAdminRepository,
    ) {}

    async execute(request: CreateRuleRequest): Promise<CreateRuleResponse> {
        console.log(`[CreateRule] name="${request.name}" permitions=${JSON.stringify(request.permitions)}`);
        const permCheck = await verifyPermission(request.token, 'CREATE_RULE', this.userAdminRepository, this.ruleRepository);
        if (!permCheck.authorized) {
            console.log(`[CreateRule] denied: ${permCheck.error}`);
            return { success: false, statusCode: permCheck.statusCode, error: new Error(permCheck.error ?? 'Forbidden') };
        }

        const { token: _token, ...body } = request;
        const validationResult = createRuleRequestSchema.omit({ token: true }).safeParse(body);
        if (!validationResult.success) {
            const errorMessage = validationResult.error.issues.map(e => e.message).join(', ');
            return { success: false, error: new Error(errorMessage) };
        }

        const rule = await this.ruleRepository.create({
            name: request.name,
            permitions: request.permitions,
            description: request.description,
        });
        console.log(`[CreateRule] success ruleId="${rule.id}"`);
        return { success: true, rule: {
            name: rule.name,
            permitions: rule.permitions,
            id: rule.id,
            description: rule.description,
            createdAt: rule.createdAt,
            updatedAt: rule.updatedAt,
        }};
    }
}