import type { UserAdminRepository, UserAdminWithDetails } from '../ports/external/user-admin-repository.js';
import type { RuleRepository } from '../ports/external/rule-repository.js';
import { verifyPermission } from '../lib/verify-permission.js';

type ListUserAdminsResponse = {
    success: boolean;
    statusCode?: number;
    error?: Error;
    admins?: UserAdminWithDetails[];
};

export class ListUserAdminsUseCase {
    constructor(
        private userAdminRepository: UserAdminRepository,
        private ruleRepository: RuleRepository
    ) {}

    async execute(token: string): Promise<ListUserAdminsResponse> {
        const auth = await verifyPermission(token, 'READ_USER_ADMIN', this.userAdminRepository, this.ruleRepository);
        if (!auth.authorized) return { success: false, statusCode: auth.statusCode, error: new Error(auth.error) };
        const admins = await this.userAdminRepository.findAll();
        return { success: true, admins };
    }
}
