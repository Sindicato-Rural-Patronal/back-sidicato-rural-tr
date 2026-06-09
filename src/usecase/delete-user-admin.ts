import type { UserAdminRepository } from '../ports/external/user-admin-repository.js';
import type { RuleRepository } from '../ports/external/rule-repository.js';
import { verifyPermission } from '../lib/verify-permission.js';

type DeleteUserAdminResponse = { success: boolean; statusCode?: number; error?: Error };

export class DeleteUserAdminUseCase {
    constructor(
        private readonly userAdminRepository: UserAdminRepository,
        private readonly ruleRepository: RuleRepository,
    ) {}

    async execute(targetAdminId: string, token: string): Promise<DeleteUserAdminResponse> {
        console.log(`[DeleteUserAdmin] targetAdminId="${targetAdminId}"`);
        const auth = await verifyPermission(token, 'DELETE_USER_ADMIN', this.userAdminRepository, this.ruleRepository);
        if (!auth.authorized) {
            console.log(`[DeleteUserAdmin] denied: ${auth.error}`);
            return { success: false, statusCode: auth.statusCode, error: new Error(auth.error) };
        }

        const existing = await this.userAdminRepository.findById(targetAdminId);
        if (!existing) {
            console.log(`[DeleteUserAdmin] admin not found: ${targetAdminId}`);
            return { success: false, statusCode: 404, error: new Error('Admin not found') };
        }

        await this.userAdminRepository.delete(targetAdminId);
        console.log(`[DeleteUserAdmin] success targetAdminId="${targetAdminId}"`);
        return { success: true };
    }
}
