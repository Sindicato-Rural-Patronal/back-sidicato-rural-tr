import { z } from 'zod';
import { hash } from 'bcrypt';
import type { UserAdminRepository } from '../ports/external/user-admin-repository.js';
import type { RuleRepository } from '../ports/external/rule-repository.js';
import { verifyPermission } from '../lib/verify-permission.js';

const updateUserAdminSchema = z.object({
    username: z.string().min(1).optional(),
    password: z.string().min(6).optional(),
    rulesId: z.string().uuid().optional(),
});

export type UpdateUserAdminRequest = z.infer<typeof updateUserAdminSchema> & { targetAdminId: string; token: string };

type UpdateUserAdminResponse = { success: boolean; statusCode?: number; error?: Error };

export class UpdateUserAdminUseCase {
    constructor(
        private readonly userAdminRepository: UserAdminRepository,
        private readonly ruleRepository: RuleRepository,
    ) {}

    async execute(request: UpdateUserAdminRequest): Promise<UpdateUserAdminResponse> {
        const auth = await verifyPermission(request.token, 'UPDATE_USER_ADMIN', this.userAdminRepository, this.ruleRepository);
        if (!auth.authorized) return { success: false, statusCode: auth.statusCode, error: new Error(auth.error) };

        const { targetAdminId, token: _token, ...body } = request;
        const validation = updateUserAdminSchema.safeParse(body);
        if (!validation.success) {
            return { success: false, error: new Error(validation.error.issues.map(e => e.message).join(', ')) };
        }

        const existing = await this.userAdminRepository.findById(targetAdminId);
        if (!existing) return { success: false, statusCode: 404, error: new Error('Admin not found') };
        console.log(`[UpdateUserAdmin] found admin: id="${existing.id}" username="${existing.username}" rulesId="${existing.rulesId}"`);

        const data = validation.data;
        console.log(`[UpdateUserAdmin] update payload from request: ${JSON.stringify(data)}`);

        if (data.username) {
            const conflict = await this.userAdminRepository.findByUsername(data.username);
            if (conflict && conflict.id !== targetAdminId) {
                return { success: false, statusCode: 409, error: new Error('Username already in use') };
            }
        }

        if (data.rulesId) {
            const rule = await this.ruleRepository.findById(data.rulesId);
            if (!rule) return { success: false, statusCode: 404, error: new Error('Rule not found') };
            console.log(`[UpdateUserAdmin] new rule found: id="${rule.id}" name="${rule.name}" permitions=${JSON.stringify(rule.permitions)}`);
        } else {
            console.log(`[UpdateUserAdmin] rulesId NOT in request — rule will NOT be changed`);
        }

        const updatePayload: { username?: string; passwordHash?: string; rulesId?: string } = {};
        if (data.username) updatePayload.username = data.username;
        if (data.rulesId) updatePayload.rulesId = data.rulesId;
        if (data.password) updatePayload.passwordHash = await hash(data.password, 10);

        console.log(`[UpdateUserAdmin] final DB updatePayload keys: ${JSON.stringify(Object.keys(updatePayload))}`);

        const updated = await this.userAdminRepository.update(targetAdminId, updatePayload);
        if (!updated) return { success: false, error: new Error('Failed to update admin') };

        console.log(`[UpdateUserAdmin] after update: id="${updated.id}" rulesId="${updated.rulesId}"`);

        return { success: true };
    }
}
