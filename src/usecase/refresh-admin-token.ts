import type { UserAdminRepository } from '../ports/external/user-admin-repository.js';
import type { RuleRepository } from '../ports/external/rule-repository.js';
import { decodeToken } from '../lib/auth.js';
import { AuthError } from '../errors/auth.js';
import { ADMIN_SESSION_MAX_SECONDS, signAdminToken } from './login-user-admin.js';

type RefreshAdminTokenResponse = {
    error?: Error;
    token?: string;
};

// Renova o token de um admin logado: exige um token ainda válido e que o admin
// continue existindo (não excluído, com regra) — mesmo critério do requireAuth.
// Devolve um token novo com o mesmo payload e validade cheia, até o teto de
// ADMIN_SESSION_MAX_SECONDS desde o login (tokens antigos, sem authTime, contam do iat).
export class RefreshAdminTokenUseCase {
    constructor(
        private readonly userAdminRepository: UserAdminRepository,
        private readonly ruleRepository: RuleRepository,
    ) {}

    async execute(token: string): Promise<RefreshAdminTokenResponse> {
        const decoded = decodeToken(token) as {
 userId?: string;
iat?: number;
authTime?: number 
} | null;
        if (!decoded?.userId) return { error: new AuthError('Unauthorized') };

        const authTime = typeof decoded.authTime === 'number' ? decoded.authTime : decoded.iat;
        if (!authTime || Math.floor(Date.now() / 1000) - authTime > ADMIN_SESSION_MAX_SECONDS) {
            return { error: new AuthError('Session expired') };
        }

        const admin = await this.userAdminRepository.findById(decoded.userId);
        if (!admin) return { error: new AuthError('Admin not found') };

        const rule = await this.ruleRepository.findById(admin.rulesId);
        if (!rule) return { error: new AuthError('Admin not found') };

        return { token: signAdminToken(admin, authTime) };
    }
}
