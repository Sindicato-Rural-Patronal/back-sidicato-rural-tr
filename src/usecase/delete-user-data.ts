import type { UserDataRepository } from '../ports/external/user-data-repository.js';
import type { UserAdminRepository } from '../ports/external/user-admin-repository.js';
import type { RuleRepository } from '../ports/external/rule-repository.js';
import { UserNotFoundError } from '../errors/not-found.js';
import { ForbiddenError } from '../errors/auth.js';
import { checkAdminRemoval } from './admin-guards.js';

type DeleteUserDataResponse = { error?: Error };

export class DeleteUserDataUseCase {
    constructor(
        private readonly userDataRepository: UserDataRepository,
        private readonly userAdminRepository: UserAdminRepository,
        private readonly ruleRepository: RuleRepository,
    ) {}

    /** `actor`: o admin que pede (UserAdmin.id e as permissões da regra dele). */
    async execute(userId: string, actor: {
 id: string;
permissions: readonly string[] 
}): Promise<DeleteUserDataResponse> {
        const existing = await this.userDataRepository.findById(userId);
        if (!existing) {
            return { error: new UserNotFoundError() };
        }

        // Excluir a pessoa leva junto o login dela (UserDataAdapter.delete). Se
        // ela é administradora, valem as travas de excluir admin: sem isso,
        // DELETE_USER bastava para derrubar o acesso de qualquer admin,
        // inclusive o último ou um com mais permissões que quem pediu.
        const admin = await this.userAdminRepository.findByUserDataId(userId);
        if (admin) {
            if (!actor.permissions.includes('DELETE_USER_ADMIN')) {
                return {
                    error: new ForbiddenError(
                        'Esta pessoa tem acesso ao painel: excluí-la exige também a permissão de excluir administradores.',
                    ),
                };
            }
            const blocked = await checkAdminRemoval(
                { userAdminRepository: this.userAdminRepository,
ruleRepository: this.ruleRepository },
                admin,
                actor,
                'person',
            );
            if (blocked) return { error: blocked };
        }

        await this.userDataRepository.delete(userId);
        return {};
    }
}
