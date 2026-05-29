import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { LoginUserAdminUseCase } from '../login-user-admin.js';
import type { UserAdminRepository } from '../../ports/external/user-admin-repository.js';

const mockUserAdminRepo = {
    findByUsername: vi.fn(),
    findByUserDataId: vi.fn(),
    create: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
} as unknown as UserAdminRepository;

const PASSWORD_PLAIN = 'senha123';

async function makeAdmin(overrides = {}) {
    return {
        id: 'admin-uuid',
        username: 'admin',
        passwordHash: await bcrypt.hash(PASSWORD_PLAIN, 10),
        rulesId: 'rule-uuid',
        userDataId: 'data-uuid',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    };
}

describe('LoginUserAdminUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('autenticação de credenciais', () => {
        it('falha se usuário não existe', async () => {
            vi.mocked(mockUserAdminRepo.findByUsername).mockResolvedValue(null);
            const uc = new LoginUserAdminUseCase(mockUserAdminRepo);
            const result = await uc.execute('nao-existe', 'qualquer');
            expect(result.token).toBe('');
            expect(result.Error?.message).toBe('Invalid username or password');
        });

        it('falha se senha incorreta', async () => {
            vi.mocked(mockUserAdminRepo.findByUsername).mockResolvedValue(await makeAdmin() as any);
            const uc = new LoginUserAdminUseCase(mockUserAdminRepo);
            const result = await uc.execute('admin', 'senha-errada');
            expect(result.token).toBe('');
            expect(result.Error?.message).toBe('Invalid username or password');
        });

        it('não expõe qual campo está errado (usuário vs senha)', async () => {
            vi.mocked(mockUserAdminRepo.findByUsername).mockResolvedValue(null);
            const uc = new LoginUserAdminUseCase(mockUserAdminRepo);
            const resultNoUser = await uc.execute('ghost', 'any');
            vi.mocked(mockUserAdminRepo.findByUsername).mockResolvedValue(await makeAdmin() as any);
            const resultWrongPwd = await uc.execute('admin', 'wrong');
            expect(resultNoUser.Error?.message).toBe(resultWrongPwd.Error?.message);
        });
    });

    describe('geração de JWT', () => {
        it('retorna token válido com credenciais corretas', async () => {
            vi.mocked(mockUserAdminRepo.findByUsername).mockResolvedValue(await makeAdmin() as any);
            const uc = new LoginUserAdminUseCase(mockUserAdminRepo);
            const result = await uc.execute('admin', PASSWORD_PLAIN);
            expect(result.token).not.toBe('');
            expect(result.Error).toBeUndefined();
        });

        it('token contém userId, username e role no payload', async () => {
            const admin = await makeAdmin();
            vi.mocked(mockUserAdminRepo.findByUsername).mockResolvedValue(admin as any);
            const uc = new LoginUserAdminUseCase(mockUserAdminRepo);
            const result = await uc.execute('admin', PASSWORD_PLAIN);
            const secret = process.env.JWT_SECRET ?? 'fallback_secret_change_me';
            const payload = jwt.verify(result.token, secret) as Record<string, unknown>;
            expect(payload.userId).toBe(admin.id);
            expect(payload.username).toBe(admin.username);
            expect(payload.role).toBe(admin.rulesId);
        });
    });
});
