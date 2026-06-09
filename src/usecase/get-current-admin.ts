import jwt from 'jsonwebtoken';
import type { UserAdminRepository } from '../ports/external/user-admin-repository.js';
import type { RuleRepository } from '../ports/external/rule-repository.js';

export type CurrentAdminResponse = {
    success: boolean;
    statusCode?: number;
    error?: Error;
    data?: {
        userId: string;
        username: string;
        rulesId: string;
        ruleName: string;
        permitions: string[];
    };
};

export class GetCurrentAdminUseCase {
    constructor(
        private readonly userAdminRepository: UserAdminRepository,
        private readonly ruleRepository: RuleRepository,
    ) {}

    async execute(token: string): Promise<CurrentAdminResponse> {
        if (!token) return { success: false, statusCode: 401, error: new Error('Token required') };

        let userId: string;
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
            userId = decoded.userId;
        } catch {
            return { success: false, statusCode: 401, error: new Error('Invalid or expired token') };
        }

        const admin = await this.userAdminRepository.findById(userId);
        if (!admin) return { success: false, statusCode: 401, error: new Error('Admin not found') };

        const rule = await this.ruleRepository.findById(admin.rulesId);
        if (!rule) return { success: false, statusCode: 403, error: new Error('Permission rule not found') };

        return {
            success: true,
            data: {
                userId: admin.id,
                username: admin.username,
                rulesId: admin.rulesId,
                ruleName: rule.name,
                permitions: rule.permitions,
            },
        };
    }
}
