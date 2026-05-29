import jwt from 'jsonwebtoken';
import type { UserAdminRepository } from '../ports/external/user-admin-repository.js';
import type { RuleRepository } from '../ports/external/rule-repository.js';

export async function verifyPermission(
    token: string,
    permission: string,
    userAdminRepository: UserAdminRepository,
    ruleRepository: RuleRepository
): Promise<{ authorized: boolean; statusCode: number; error?: string }> {
    if (!token) return { authorized: false, statusCode: 401, error: 'Token required' };

    let userId: string;
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
        userId = decoded.userId;
    } catch {
        return { authorized: false, statusCode: 401, error: 'Invalid or expired token' };
    }

    const admin = await userAdminRepository.findById(userId);
    if (!admin) return { authorized: false, statusCode: 401, error: 'Admin not found' };

    const rule = await ruleRepository.findById(admin.rulesId);
    if (!rule) return { authorized: false, statusCode: 403, error: 'Permission rule not found' };

    if (!rule.permitions.some(p => p === permission)) {
        return { authorized: false, statusCode: 403, error: `Permission denied: ${permission} is required` };
    }

    return { authorized: true, statusCode: 200 };
}
