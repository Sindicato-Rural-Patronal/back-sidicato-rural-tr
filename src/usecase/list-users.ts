import type { UserDataRepository } from '../ports/external/user-data-repository.js';
import type { UserAdminRepository } from '../ports/external/user-admin-repository.js';
import type { RuleRepository } from '../ports/external/rule-repository.js';
import type { UserDataModel } from '../generated/prisma/models/UserData.js';
import { verifyPermission } from '../lib/verify-permission.js';

type PagedResult<T> = { data: T[]; total: number; page: number; limit: number; totalPages: number };
type ListUsersResponse = { success: boolean; statusCode?: number; error?: Error; result?: PagedResult<UserDataModel> };

export class ListUsersUseCase {
    constructor(
        private userDataRepository: UserDataRepository,
        private userAdminRepository: UserAdminRepository,
        private ruleRepository: RuleRepository
    ) {}

    async execute(token: string, page = 1, limit = 20): Promise<ListUsersResponse> {
        const auth = await verifyPermission(token, 'READ_USER', this.userAdminRepository, this.ruleRepository);
        if (!auth.authorized) {
            console.log(`[ListUsers] denied: ${auth.error}`);
            return { success: false, statusCode: auth.statusCode, error: new Error(auth.error) };
        }
        const skip = (page - 1) * limit;
        const [users, total] = await Promise.all([
            this.userDataRepository.findAll(skip, limit),
            this.userDataRepository.count(),
        ]);
        console.log(`[ListUsers] page=${page} limit=${limit} total=${total}`);
        return { success: true, result: { data: users, total, page, limit, totalPages: Math.ceil(total / limit) } };
    }
}
