import type { UserAdminRepository } from '../ports/external/user-admin-repository.js';
import type { UserDataRepository } from '../ports/external/user-data-repository.js';
import type { RuleRepository } from '../ports/external/rule-repository.js';
import { hash } from 'bcrypt';
import { UsernameAlreadyExistsError, AdminAccountAlreadyExistsError } from '../errors/conflict.js';
import { UserDataNotFoundError, RoleNotFoundError } from '../errors/not-found.js';
import { ForbiddenError } from '../errors/auth.js';
import { isPrismaUniqueViolation } from '../lib/prisma-errors.js';

type CreateUserAdminRequest = {
    username: string;
    password: string;
    userDataId: string;
    userRole: string;
};

type CreateUserAdminResponse = {
    error?: Error;
    userAdminId?: string;
};

export class CreateUserAdminUseCase {
    constructor(
        private userAdminRepository: UserAdminRepository,
        private userDataRepository: UserDataRepository,
        private ruleRepository: RuleRepository,
    ) {}

    async execute(request: CreateUserAdminRequest, actorPermissions: string[] = []): Promise<CreateUserAdminResponse> {
        // Username é unique no banco INCLUINDO soft-deletados. Se um admin ativo
        // (de outra pessoa) usa o nome → conflito. Se só um apagado o segura,
        // liberamos renomeando a linha antiga (permite reusar o nome).
        const holder = await this.userAdminRepository.findByUsernameAny(request.username);
        if (holder && holder.userDataId !== request.userDataId) {
            if (!holder.isDeleted) return { error: new UsernameAlreadyExistsError() };
            await this.userAdminRepository.update(holder.id, {
                username: `${holder.username}__del_${holder.id.slice(0, 8)}`,
            });
        }

        const userData = await this.userDataRepository.findById(request.userDataId);
        if (!userData) {
            return { error: new UserDataNotFoundError() };
        }

        // Considera também registros soft-deleted: a constraint unique de
        // userDataId no banco os mantém, então recriar direto violaria o unique.
        const existingAdminForUserData = await this.userAdminRepository.findByUserDataIdAny(
            request.userDataId,
        );
        if (existingAdminForUserData && !existingAdminForUserData.isDeleted) {
            return { error: new AdminAccountAlreadyExistsError() };
        }

        const roleToAssign = await this.ruleRepository.findById(request.userRole);
        if (!roleToAssign) {
            return { error: new RoleNotFoundError() };
        }
        // Anti-escalonamento: não atribuir uma regra com permissões além das do ator.
        const escalates = (roleToAssign.permissions as string[]).some(p => !actorPermissions.includes(p));
        if (escalates) {
            return { error: new ForbiddenError('Você não pode atribuir uma regra com permissões além das suas.') };
        }

        const hashedPassword = await hash(request.password, 10);

        try {
            // Se havia um admin removido para esse associado, reaproveita a linha.
            if (existingAdminForUserData) {
                const reactivated = await this.userAdminRepository.reactivate(
                    existingAdminForUserData.id,
                    {
                        username: request.username,
                        passwordHash: hashedPassword,
                        rulesId: request.userRole,
                    },
                );
                return { userAdminId: reactivated.id };
            }

            const newAdmin = await this.userAdminRepository.create({
                username: request.username,
                passwordHash: hashedPassword,
                userDataId: request.userDataId,
                rulesId: request.userRole,
            });
            return { userAdminId: newAdmin.id };
        } catch (err: unknown) {
            if (isPrismaUniqueViolation(err)) {
                return { error: new UsernameAlreadyExistsError() };
            }
            const msg = err instanceof Error ? err.message : String(err);
            return { error: new Error(`Failed to create admin: ${msg}`) };
        }
    }
}
