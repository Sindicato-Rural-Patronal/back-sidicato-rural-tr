import { UserDataRepository } from '../ports/external/user-data-repository.js';
import { UserAdminRepository } from '../ports/external/user-admin-repository.js';
import { RuleRepository } from '../ports/external/rule-repository.js';
import { UserDataModel } from '../generated/prisma/models/UserData.js';
import { verifyPermission } from '../lib/verify-permission.js';

type ListUsersResponse = {
    success: boolean;
    statusCode?: number;
    error?: Error;
    users?: UserDataModel[];
};

export class ListUsersUseCase {
    constructor(
        private userDataRepository: UserDataRepository,
        private userAdminRepository: UserAdminRepository,
        private ruleRepository: RuleRepository
    ) {}

    async execute(token: string): Promise<ListUsersResponse> {
        const auth = await verifyPermission(token, 'READ_USER', this.userAdminRepository, this.ruleRepository);
        if (!auth.authorized) return { success: false, statusCode: auth.statusCode, error: new Error(auth.error) };
        const users = await this.userDataRepository.findAll();
        return { success: true, users };
    }
}
