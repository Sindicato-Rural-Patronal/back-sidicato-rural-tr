import type { UserAdminRepository } from '../ports/external/user-admin-repository.js';
import type { UserDataRepository } from '../ports/external/user-data-repository.js';
import type { RuleRepository } from '../ports/external/rule-repository.js';
import { hash } from 'bcrypt';
import { UsernameAlreadyExistsError, AdminAccountAlreadyExistsError } from '../errors/conflict.js';
import { UserDataNotFoundError, RoleNotFoundError } from '../errors/not-found.js';

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

    async execute(request: CreateUserAdminRequest): Promise<CreateUserAdminResponse> {
        console.log(
            `[CreateUserAdmin] username="${request.username}" userDataId="${request.userDataId}" userRole="${request.userRole}"`,
        );
        const existingAdmin = await this.userAdminRepository.findByUsername(request.username);
        if (existingAdmin) {
            return { error: new UsernameAlreadyExistsError() };
        }

        const userData = await this.userDataRepository.findById(request.userDataId);
        if (!userData) {
            return { error: new UserDataNotFoundError() };
        }

        const existingAdminForUserData = await this.userAdminRepository.findByUserDataId(
            request.userDataId,
        );
        if (existingAdminForUserData) {
            return { error: new AdminAccountAlreadyExistsError() };
        }

        const roleToAssign = await this.ruleRepository.findById(request.userRole);
        if (!roleToAssign) {
            return { error: new RoleNotFoundError() };
        }

        const hashedPassword = await hash(request.password, 10);

        try {
            const newAdmin = await this.userAdminRepository.create({
                username: request.username,
                passwordHash: hashedPassword,
                userDataId: request.userDataId,
                rulesId: request.userRole,
            });
            console.log(`[CreateUserAdmin] success userAdminId="${newAdmin.id}"`);
            return { userAdminId: newAdmin.id };
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            return { error: new Error(`Failed to create admin: ${msg}`) };
        }
    }
}
