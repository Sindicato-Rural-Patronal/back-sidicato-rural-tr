import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { CreateUserAdminUseCase } from '../create-user-admin.js';
import type { UserAdminRepository } from '../../ports/external/user-admin-repository.js';
import type { UserDataRepository } from '../../ports/external/user-data-repository.js';
import type { RuleRepository } from '../../ports/external/rule-repository.js';

const JWT_SECRET = 'test-secret-minimum-32-characters-ok';
process.env.JWT_SECRET = JWT_SECRET;

const mockUserAdminRepo = {
    create: vi.fn(),
    findById: vi.fn(),
    findByUsername: vi.fn(),
    findByUserDataId: vi.fn(),
    findAll: vi.fn(),
} as unknown as UserAdminRepository;

const mockUserDataRepo = {
    create: vi.fn(),
    findById: vi.fn(),
    findByEmailOurPhone: vi.fn(),
    findByEmailOrCpf: vi.fn(),
    findAll: vi.fn(),
} as unknown as UserDataRepository;

const mockRuleRepo = {
    create: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    update: vi.fn(),
} as unknown as RuleRepository;

function makeToken(userId: string) {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '1h' });
}

const validInput = {
    username: 'novo.admin',
    password: 'senha123',
    userDataId: 'ud-001',
    userRole: 'role-001',
    creatorToken: '',
};

describe('CreateUserAdminUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('autenticação do criador', () => {
        it('falha se token for inválido', async () => {
            const uc = new CreateUserAdminUseCase(mockUserAdminRepo, mockUserDataRepo, mockRuleRepo);
            const result = await uc.execute({ ...validInput, creatorToken: 'token-invalido' });
            expect(result.success).toBe(false);
            expect(result.error?.message).toBe('Invalid or expired token');
        });

        it('falha se admin criador não existir no banco', async () => {
            vi.mocked(mockUserAdminRepo.findById).mockResolvedValue(null);
            const uc = new CreateUserAdminUseCase(mockUserAdminRepo, mockUserDataRepo, mockRuleRepo);
            const result = await uc.execute({ ...validInput, creatorToken: makeToken('creator-id') });
            expect(result.success).toBe(false);
            expect(result.error?.message).toBe('Creator admin not found');
        });

        it('falha se regra do criador não existir', async () => {
            vi.mocked(mockUserAdminRepo.findById).mockResolvedValue({ id: 'creator-id', rulesId: 'rule-x' } as any);
            vi.mocked(mockRuleRepo.findById).mockResolvedValue(null);
            const uc = new CreateUserAdminUseCase(mockUserAdminRepo, mockUserDataRepo, mockRuleRepo);
            const result = await uc.execute({ ...validInput, creatorToken: makeToken('creator-id') });
            expect(result.success).toBe(false);
            expect(result.error?.message).toBe('Creator permission rule not found');
        });
    });

    describe('verificação de permissão do criador', () => {
        it('falha se criador não tiver permissão CREATE_USER_ADMIN', async () => {
            vi.mocked(mockUserAdminRepo.findById).mockResolvedValue({ id: 'creator-id', rulesId: 'rule-x' } as any);
            vi.mocked(mockRuleRepo.findById).mockResolvedValue({ permitions: ['CREATE_USER'] } as any);
            const uc = new CreateUserAdminUseCase(mockUserAdminRepo, mockUserDataRepo, mockRuleRepo);
            const result = await uc.execute({ ...validInput, creatorToken: makeToken('creator-id') });
            expect(result.success).toBe(false);
            expect(result.error?.message).toBe('Permission denied: cannot create admin users');
        });

        it('permite criação com permissão CREATE_USER_ADMIN', async () => {
            vi.mocked(mockUserAdminRepo.findById).mockResolvedValue({ id: 'creator-id', rulesId: 'rule-x' } as any);
            vi.mocked(mockRuleRepo.findById)
                .mockResolvedValueOnce({ permitions: ['CREATE_USER_ADMIN'] } as any)
                .mockResolvedValueOnce({ id: 'role-001' } as any);
            vi.mocked(mockUserAdminRepo.findByUsername).mockResolvedValue(null);
            vi.mocked(mockUserDataRepo.findById).mockResolvedValue({ id: 'ud-001' } as any);
            vi.mocked(mockUserAdminRepo.findByUserDataId).mockResolvedValue(null);
            vi.mocked(mockUserAdminRepo.create).mockResolvedValue({ id: 'new-admin' } as any);
            const uc = new CreateUserAdminUseCase(mockUserAdminRepo, mockUserDataRepo, mockRuleRepo);
            const result = await uc.execute({ ...validInput, creatorToken: makeToken('creator-id') });
            expect(result.success).toBe(true);
        });
    });

    describe('validação de unicidade e existência', () => {
        beforeEach(() => {
            vi.mocked(mockUserAdminRepo.findById).mockResolvedValue({ id: 'creator-id', rulesId: 'rule-x' } as any);
            vi.mocked(mockRuleRepo.findById).mockResolvedValue({ permitions: ['CREATE_USER_ADMIN'] } as any);
        });

        it('falha se username já existir', async () => {
            vi.mocked(mockUserAdminRepo.findByUsername).mockResolvedValue({ id: 'other-admin' } as any);
            const uc = new CreateUserAdminUseCase(mockUserAdminRepo, mockUserDataRepo, mockRuleRepo);
            const result = await uc.execute({ ...validInput, creatorToken: makeToken('creator-id') });
            expect(result.success).toBe(false);
            expect(result.error?.message).toBe('Username already exists');
        });

        it('falha se userDataId não existir', async () => {
            vi.mocked(mockUserAdminRepo.findByUsername).mockResolvedValue(null);
            vi.mocked(mockUserDataRepo.findById).mockResolvedValue(null);
            const uc = new CreateUserAdminUseCase(mockUserAdminRepo, mockUserDataRepo, mockRuleRepo);
            const result = await uc.execute({ ...validInput, creatorToken: makeToken('creator-id') });
            expect(result.success).toBe(false);
            expect(result.error?.message).toBe('Invalid userDataId: user not found');
        });

        it('falha se userData já tiver conta admin', async () => {
            vi.mocked(mockUserAdminRepo.findByUsername).mockResolvedValue(null);
            vi.mocked(mockUserDataRepo.findById).mockResolvedValue({ id: 'ud-001' } as any);
            vi.mocked(mockUserAdminRepo.findByUserDataId).mockResolvedValue({ id: 'existing-admin' } as any);
            const uc = new CreateUserAdminUseCase(mockUserAdminRepo, mockUserDataRepo, mockRuleRepo);
            const result = await uc.execute({ ...validInput, creatorToken: makeToken('creator-id') });
            expect(result.success).toBe(false);
            expect(result.error?.message).toBe('This user already has an admin account');
        });

        it('falha se role de destino não existir', async () => {
            vi.mocked(mockUserAdminRepo.findByUsername).mockResolvedValue(null);
            vi.mocked(mockUserDataRepo.findById).mockResolvedValue({ id: 'ud-001' } as any);
            vi.mocked(mockUserAdminRepo.findByUserDataId).mockResolvedValue(null);
            // findById chamado 2x: 1ª = criador (rule-x), 2ª = role destino (rule-001)
            vi.mocked(mockRuleRepo.findById)
                .mockResolvedValueOnce({ permitions: ['CREATE_USER_ADMIN'] } as any)
                .mockResolvedValueOnce(null);
            const uc = new CreateUserAdminUseCase(mockUserAdminRepo, mockUserDataRepo, mockRuleRepo);
            const result = await uc.execute({ ...validInput, creatorToken: makeToken('creator-id') });
            expect(result.success).toBe(false);
            expect(result.error?.message).toBe('Invalid role: permission rule not found');
        });
    });

    describe('criação bem-sucedida', () => {
        it('retorna userAdminId ao criar admin válido', async () => {
            vi.mocked(mockUserAdminRepo.findById).mockResolvedValue({ id: 'creator-id', rulesId: 'rule-x' } as any);
            vi.mocked(mockRuleRepo.findById)
                .mockResolvedValueOnce({ permitions: ['CREATE_USER_ADMIN'] } as any)
                .mockResolvedValueOnce({ id: 'role-001' } as any);
            vi.mocked(mockUserAdminRepo.findByUsername).mockResolvedValue(null);
            vi.mocked(mockUserDataRepo.findById).mockResolvedValue({ id: 'ud-001' } as any);
            vi.mocked(mockUserAdminRepo.findByUserDataId).mockResolvedValue(null);
            vi.mocked(mockUserAdminRepo.create).mockResolvedValue({ id: 'new-admin-001' } as any);
            const uc = new CreateUserAdminUseCase(mockUserAdminRepo, mockUserDataRepo, mockRuleRepo);
            const result = await uc.execute({ ...validInput, creatorToken: makeToken('creator-id') });
            expect(result.success).toBe(true);
            expect(result.userAdminId).toBe('new-admin-001');
        });
    });
});
