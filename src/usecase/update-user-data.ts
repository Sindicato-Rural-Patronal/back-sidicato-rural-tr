import { z } from 'zod';
import type { UserDataRepository } from '../ports/external/user-data-repository.js';
import type { UserAdminRepository } from '../ports/external/user-admin-repository.js';
import type { RuleRepository } from '../ports/external/rule-repository.js';
import { verifyPermission } from '../lib/verify-permission.js';

const updateUserDataSchema = z.object({
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
    phone: z.string().min(1).optional(),
    cpf: z.string().nullable().optional(),
    cnpj: z.string().nullable().optional(),
});

export type UpdateUserDataRequest = z.infer<typeof updateUserDataSchema> & { userId: string; token: string };

type UpdateUserDataResponse = { success: boolean; statusCode?: number; error?: Error };

export class UpdateUserDataUseCase {
    constructor(
        private readonly userDataRepository: UserDataRepository,
        private readonly userAdminRepository: UserAdminRepository,
        private readonly ruleRepository: RuleRepository,
    ) {}

    async execute(request: UpdateUserDataRequest): Promise<UpdateUserDataResponse> {
        console.log(`[UpdateUserData] userId="${request.userId}"`);
        const auth = await verifyPermission(request.token, 'UPDATE_USER', this.userAdminRepository, this.ruleRepository);
        if (!auth.authorized) {
            console.log(`[UpdateUserData] denied: ${auth.error}`);
            return { success: false, statusCode: auth.statusCode, error: new Error(auth.error) };
        }

        const { userId, token: _token, ...body } = request;
        const validation = updateUserDataSchema.safeParse(body);
        if (!validation.success) {
            return { success: false, error: new Error(validation.error.issues.map(e => e.message).join(', ')) };
        }

        const existing = await this.userDataRepository.findById(userId);
        if (!existing) return { success: false, statusCode: 404, error: new Error('User not found') };

        const data = validation.data;

        if (data.email || data.cpf) {
            const conflict = await this.userDataRepository.findByEmailOrCpf(
                data.email ?? existing.email,
                data.cpf ?? existing.cpf ?? '',
            );
            if (conflict && conflict.id !== userId) {
                return { success: false, statusCode: 409, error: new Error('Email or CPF already in use') };
            }
        }

        const updated = await this.userDataRepository.update(userId, data);
        if (!updated) return { success: false, error: new Error('Failed to update user') };

        console.log(`[UpdateUserData] success userId="${userId}"`);
        return { success: true };
    }
}
