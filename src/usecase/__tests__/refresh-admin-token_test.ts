import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { RefreshAdminTokenUseCase } from '../refresh-admin-token.js';
import { signAdminToken } from '../login-user-admin.js';
import type { UserAdminRepository } from '../../ports/external/user-admin-repository.js';
import type { RuleRepository } from '../../ports/external/rule-repository.js';

const SECRET = () => process.env.JWT_SECRET!;

const mockUserAdminRepo = {
    findById: vi.fn(),
} as unknown as UserAdminRepository;

const mockRuleRepo = {
    findById: vi.fn(),
} as unknown as RuleRepository;

const admin = {
    id: 'admin-uuid',
    username: 'admin',
    passwordHash: 'hash',
    rulesId: 'rule-uuid',
    userDataId: 'data-uuid',
    isDeleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
};

const rule = {
    id: 'rule-uuid',
    name: 'Gestor',
    description: null,
    permissions: ['READ_USER'],
};

function makeUseCase() {
    return new RefreshAdminTokenUseCase(mockUserAdminRepo, mockRuleRepo);
}

describe('RefreshAdminTokenUseCase', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(mockUserAdminRepo.findById).mockResolvedValue(admin as any);
        vi.mocked(mockRuleRepo.findById).mockResolvedValue(rule as any);
    });

    it('devolve token novo com o mesmo payload e validade de 8h', async () => {
        const result = await makeUseCase().execute(signAdminToken(admin));
        expect(result.error).toBeUndefined();
        const payload = jwt.verify(result.token!, SECRET()) as Record<string, number | string>;
        expect(payload.userId).toBe(admin.id);
        expect(payload.username).toBe(admin.username);
        expect(payload.role).toBe(admin.rulesId);
        expect((payload.exp as number) - (payload.iat as number)).toBe(8 * 60 * 60);
        expect(mockUserAdminRepo.findById).toHaveBeenCalledWith(admin.id);
    });

    it('preserva o momento do login e recusa depois de 24h desde ele', async () => {
        const now = Math.floor(Date.now() / 1000);
        const recent = signAdminToken(admin, now - 60 * 60);
        const renewed = await makeUseCase().execute(recent);
        expect((jwt.decode(renewed.token!) as { authTime: number }).authTime).toBe(now - 60 * 60);

        const oldLogin = signAdminToken(admin, now - 25 * 60 * 60);
        const refused = await makeUseCase().execute(oldLogin);
        expect(refused.token).toBeUndefined();
        expect(refused.error?.message).toBe('Session expired');
    });

    it('o token novo vale mais que o antigo quase vencido', async () => {
        const payload = {
            userId: admin.id,
            username: admin.username,
            role: admin.rulesId,
        };
        const old = jwt.sign(payload, SECRET(), { expiresIn: 60 });
        const result = await makeUseCase().execute(old);
        const oldExp = (jwt.decode(old) as { exp: number }).exp;
        const newExp = (jwt.decode(result.token!) as { exp: number }).exp;
        expect(newExp).toBeGreaterThan(oldExp);
    });

    it('usa os dados atuais do admin (ex.: usuário renomeado)', async () => {
        const renamed = {
            ...admin,
            username: 'novo.nome',
        };
        vi.mocked(mockUserAdminRepo.findById).mockResolvedValue(renamed as any);
        const result = await makeUseCase().execute(signAdminToken(admin));
        const payload = jwt.decode(result.token!) as Record<string, string>;
        expect(payload.username).toBe('novo.nome');
    });

    it('recusa sem token', async () => {
        const result = await makeUseCase().execute('');
        expect(result.error?.message).toBe('Unauthorized');
        expect(result.token).toBeUndefined();
        expect(mockUserAdminRepo.findById).not.toHaveBeenCalled();
    });

    it('recusa token expirado', async () => {
        const issuedTwoHoursAgo = {
            userId: admin.id,
            iat: Math.floor(Date.now() / 1000) - 7200,
        };
        const expired = jwt.sign(issuedTwoHoursAgo, SECRET(), { expiresIn: 3600 });
        const result = await makeUseCase().execute(expired);
        expect(result.error?.message).toBe('Unauthorized');
        expect(mockUserAdminRepo.findById).not.toHaveBeenCalled();
    });

    it('recusa token assinado com outro segredo', async () => {
        const forged = jwt.sign({ userId: admin.id }, 'outro-segredo-qualquer-com-32-caracteres!!');
        const result = await makeUseCase().execute(forged);
        expect(result.error?.message).toBe('Unauthorized');
    });

    it('recusa quando o admin foi removido', async () => {
        vi.mocked(mockUserAdminRepo.findById).mockResolvedValue(null);
        const result = await makeUseCase().execute(signAdminToken(admin));
        expect(result.error?.message).toBe('Admin not found');
        expect(result.token).toBeUndefined();
    });

    it('recusa quando a regra do admin não existe mais', async () => {
        vi.mocked(mockRuleRepo.findById).mockResolvedValue(null);
        const result = await makeUseCase().execute(signAdminToken(admin));
        expect(result.error?.message).toBe('Admin not found');
        expect(result.token).toBeUndefined();
    });
});
