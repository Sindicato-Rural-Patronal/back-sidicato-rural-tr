import type { UserAdminRepository, UserAdminWithDetails } from '../ports/external/user-admin-repository.js';
import type { RuleRepository } from '../ports/external/rule-repository.js';
import { verifyPermission } from '../lib/verify-permission.js';

type PagedResult<T> = { data: T[]; total: number; page: number; limit: number; totalPages: number };
type ListUserAdminsResponse = { success: boolean; statusCode?: number; error?: Error; result?: PagedResult<UserAdminWithDetails> };

export class ListUserAdminsUseCase {
    constructor(
        private userAdminRepository: UserAdminRepository,
        private ruleRepository: RuleRepository
    ) {}

    async execute(token: string, page = 1, limit = 20): Promise<ListUserAdminsResponse> {
        const auth = await verifyPermission(token, 'READ_USER_ADMIN', this.userAdminRepository, this.ruleRepository);
        if (!auth.authorized) {
            console.log(`[ListUserAdmins] denied: ${auth.error}`);
            return { success: false, statusCode: auth.statusCode, error: new Error(auth.error) };
        }
        const skip = (page - 1) * limit;
        const [admins, total] = await Promise.all([
            this.userAdminRepository.findAll(skip, limit),
            this.userAdminRepository.count(),
        ]);
        console.log(`[ListUserAdmins] page=${page} limit=${limit} total=${total}`);
        return { success: true, result: { data: admins, total, page, limit, totalPages: Math.ceil(total / limit) } };
    }
}
