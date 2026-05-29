import type { UserAdminRepository } from "../ports/external/user-admin-repository";
import type { UserDataRepository } from "../ports/external/user-data-repository";
import type { RuleRepository } from "../ports/external/rule-repository";
import { hash } from 'bcrypt';
import jwt from 'jsonwebtoken';

type CreateUserAdminRequest = {
    username: string;
    password: string;
    userDataId: string;
    userRole: string;   
    creatorToken: string; 
}

type CreateUserAdminResponse = {
    success: boolean;
    error?: Error;
    userAdminId?: string;
}

export class CreateUserAdminUseCase {
    constructor(
        private userAdminRepository: UserAdminRepository,
        private userDataRepository: UserDataRepository,
        private ruleRepository: RuleRepository 
    ) {}

    async execute(request: CreateUserAdminRequest): Promise<CreateUserAdminResponse> {
        let creatorId: string;
        try {
            const decoded = jwt.verify(request.creatorToken, process.env.JWT_SECRET!) as { userId: string };
            creatorId = decoded.userId;
        } catch {
            return { success: false, error: new Error('Invalid or expired token') };
        }

        const creatorAdmin = await this.userAdminRepository.findById(creatorId);
        if (!creatorAdmin) {
            return { success: false, error: new Error('Creator admin not found') };
        }

        const creatorRule = await this.ruleRepository.findById(creatorAdmin.rulesId);
        if (!creatorRule) {
            return { success: false, error: new Error('Creator permission rule not found') };
        }

        const canCreateUser = creatorRule.permitions.some((p: string) => p === 'CREATE_USER_ADMIN');
        if (!canCreateUser) {
            return { success: false, error: new Error('Permission denied: cannot create admin users') };
        }

        const existingAdmin = await this.userAdminRepository.findByUsername(request.username);
        if (existingAdmin) {
            return { success: false, error: new Error('Username already exists') };
        }

        const userData = await this.userDataRepository.findById(request.userDataId);
        if (!userData) {
            return { success: false, error: new Error('Invalid userDataId: user not found') };
        }

        const existingAdminForUserData = await this.userAdminRepository.findByUserDataId(request.userDataId);
        if (existingAdminForUserData) {
            return { success: false, error: new Error('This user already has an admin account') };
        }

        const roleToAssign = await this.ruleRepository.findById(request.userRole);
        if (!roleToAssign) {
            return { success: false, error: new Error('Invalid role: permission rule not found') };
        }

        const hashedPassword = await hash(request.password, 10);

        try {
            const newAdmin = await this.userAdminRepository.create({
                username: request.username,
                passwordHash: hashedPassword,
                userDataId: request.userDataId,
                rulesId: request.userRole,
            });
            return { success: true, userAdminId: newAdmin.id };
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            return { success: false, error: new Error(`Failed to create admin: ${msg}`) };
        }
    }
}