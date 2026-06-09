import type { UserDataRepository } from '../ports/external/user-data-repository.js';
import type { UserAdminRepository } from '../ports/external/user-admin-repository.js';
import type { RuleRepository } from '../ports/external/rule-repository.js';
import { verifyPermission } from '../lib/verify-permission.js';

type DeleteUserDataResponse = { success: boolean; statusCode?: number; error?: Error };

export class DeleteUserDataUseCase {
    constructor(
        private readonly userDataRepository: UserDataRepository,
        private readonly userAdminRepository: UserAdminRepository,
        private readonly ruleRepository: RuleRepository,
    ) {}

    async execute(userId: string, token: string): Promise<DeleteUserDataResponse> {
        console.log(`[DeleteUserData] userId="${userId}"`);
        const auth = await verifyPermission(token, 'DELETE_USER', this.userAdminRepository, this.ruleRepository);
        if (!auth.authorized) {
            console.log(`[DeleteUserData] denied: ${auth.error}`);
            return { success: false, statusCode: auth.statusCode, error: new Error(auth.error) };
        }

        const existing = await this.userDataRepository.findById(userId);
        if (!existing) {
            console.log(`[DeleteUserData] user not found: ${userId}`);
            return { success: false, statusCode: 404, error: new Error('User not found') };
        }

        await this.userDataRepository.delete(userId);
        console.log(`[DeleteUserData] success userId="${userId}"`);
        return { success: true };
    }
}
