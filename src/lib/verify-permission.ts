import jwt from 'jsonwebtoken';
import type { UserAdminRepository } from '../ports/external/user-admin-repository.js';
import type { RuleRepository } from '../ports/external/rule-repository.js';

export async function verifyPermission(
    token: string,
    permission: string,
    userAdminRepository: UserAdminRepository,
    ruleRepository: RuleRepository
): Promise<{ authorized: boolean; statusCode: number; error?: string }> {
    console.log(`[verifyPermission] checking permission="${permission}" token=${token ? token.slice(0, 20) + '...' : 'EMPTY'}`);

    if (!token) return { authorized: false, statusCode: 401, error: 'Token required' };

    let userId: string;
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
        userId = decoded.userId;
        console.log(`[verifyPermission] decoded userId="${userId}"`);
    } catch (err) {
        console.log(`[verifyPermission] token invalid: ${err}`);
        return { authorized: false, statusCode: 401, error: 'Invalid or expired token' };
    }

    const admin = await userAdminRepository.findById(userId);
    if (!admin) {
        console.log(`[verifyPermission] admin not found for userId="${userId}"`);
        return { authorized: false, statusCode: 401, error: 'Admin not found' };
    }
    console.log(`[verifyPermission] admin found: username="${admin.username}" rulesId="${admin.rulesId}"`);

    const rule = await ruleRepository.findById(admin.rulesId);
    if (!rule) {
        console.log(`[verifyPermission] rule not found for rulesId="${admin.rulesId}"`);
        return { authorized: false, statusCode: 403, error: 'Permission rule not found' };
    }
    console.log(`[verifyPermission] rule found: name="${rule.name}" permitions=${JSON.stringify(rule.permitions)}`);

    const hasPermission = rule.permitions.some((p: string) => p === permission);
    console.log(`[verifyPermission] has "${permission}"? ${hasPermission}`);

    if (!hasPermission) {
        return { authorized: false, statusCode: 403, error: `Permission denied: ${permission} is required` };
    }

    return { authorized: true, statusCode: 200 };
}
