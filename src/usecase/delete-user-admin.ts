import type { UserAdminRepository } from '../ports/external/user-admin-repository.js';
import type { RuleRepository } from '../ports/external/rule-repository.js';
import { AdminNotFoundError } from '../errors/not-found.js';
import { ValidationError } from '../errors/validation.js';
import { ForbiddenError } from '../errors/auth.js';

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

        // Não permitir que o ator exclua a própria conta de administrador.
        if (targetAdminId === actorId) {
            return { error: new ValidationError('Você não pode excluir a sua própria conta de administrador.') };
        }

        // Anti-escalonamento: não excluir um admin cuja regra tem permissões além das do ator.
        const targetRule = await this.ruleRepository.findById(existing.rulesId);
        const targetPermissions = (targetRule?.permissions as string[] | undefined) ?? [];
        const escalates = targetPermissions.some(p => !actorPermissions.includes(p));
        if (escalates) {
            return { error: new ForbiddenError('Você não pode excluir um administrador com permissões além das suas.') };
        }

        // Nunca deixar o sistema sem administradores ativos.
        const activeAdmins = await this.userAdminRepository.count();
        if (activeAdmins <= 1) {
            return { error: new ValidationError('Não é possível excluir o último administrador ativo.') };
        }

        await this.userAdminRepository.delete(targetAdminId);
        return {};
    }
}
