import type { UserAdminRepository } from '../ports/external/user-admin-repository.js';
import type { RuleRepository } from '../ports/external/rule-repository.js';
import { AdminNotFoundError } from '../errors/not-found.js';
import { checkAdminRemoval } from './admin-guards.js';

type DeleteUserAdminResponse = { error?: Error };

export class DeleteUserAdminUseCase {
    constructor(
        private readonly userAdminRepository: UserAdminRepository,
        private readonly ruleRepository: RuleRepository,
    ) {}

    async execute(
        targetAdminId: string,
        actorId: string,
        actorPermissions: string[] = [],
    ): Promise<DeleteUserAdminResponse> {
        const existing = await this.userAdminRepository.findById(targetAdminId);
        if (!existing) {
            return { error: new AdminNotFoundError() };
        }

        // Não a si mesmo, não quem tem permissões além das do ator, nunca o último.
        const blocked = await checkAdminRemoval(
            { userAdminRepository: this.userAdminRepository,
ruleRepository: this.ruleRepository },
            existing,
            { id: actorId,
permissions: actorPermissions },
            'admin',
        );
        if (blocked) return { error: blocked };

        await this.userAdminRepository.delete(targetAdminId);
        return {};
    }
}
