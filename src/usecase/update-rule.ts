import z from "zod";
import type { RuleRepository } from "../ports/external/rule-repository.js";
import type { UserAdminRepository } from "../ports/external/user-admin-repository.js";
import { permitions } from "../generated/prisma/browser.js";
import { verifyPermission } from "../lib/verify-permission.js";

export const updateRuleRequestSchema = z.object({
    ruleId: z.string().min(1),
    name: z.string().min(1).optional(),
    permitions: z.array(z.enum(permitions)).min(1).optional(),
    description: z.string().optional(),
    token: z.string().min(1, 'Token is required'),
});
export type UpdateRuleRequest = z.infer<typeof updateRuleRequestSchema>;

export class UpdateRuleUseCase {
    constructor(
        private ruleRepository: RuleRepository,
        private userAdminRepository: UserAdminRepository,
    ) {}

    async execute(request: UpdateRuleRequest) {
        const validation = updateRuleRequestSchema.safeParse(request);
        if (!validation.success) {
            return { success: false, error: new Error(validation.error.issues.map(e => e.message).join(', ')) };
        }

        const permCheck = await verifyPermission(request.token, 'UPDATE_RULE', this.userAdminRepository, this.ruleRepository);
        if (!permCheck.authorized) {
            return { success: false, statusCode: permCheck.statusCode, forbidden: permCheck.statusCode === 403, error: new Error(permCheck.error ?? 'Forbidden') };
        }

        const rule = await this.ruleRepository.findById(request.ruleId);
        if (!rule) {
            return { success: false, notFound: true, error: new Error('Rule not found') };
        }

        const updated = await this.ruleRepository.update(request.ruleId, {
            name: request.name,
            permitions: request.permitions,
            description: request.description,
        });

        return { success: true, rule: updated };
    }
}
