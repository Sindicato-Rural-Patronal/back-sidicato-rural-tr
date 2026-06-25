import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateUserAdminUseCase } from '../create-user-admin.js';
import type { UserAdminRepository } from '../../ports/external/user-admin-repository.js';
import type { UserDataRepository } from '../../ports/external/user-data-repository.js';
import type { RuleRepository } from '../../ports/external/rule-repository.js';

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
    findByCpf: vi.fn(),
    findByRg: vi.fn(),
    findByEmailOrCpf: vi.fn(),
    findAll: vi.fn(),
} as unknown as UserDataRepository;

const mockRuleRepo = {
    create: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    update: vi.fn(),
} as unknown as RuleRepository;

const validInput = {
    username: 'novo.admin',
    password: 'senha123',
    userDataId: 'ud-001',
    userRole: 'role-001',
};

describe('CreateUserAdminUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('validação de unicidade e existência', () => {
        it('falha se username já existir', async () => {
            vi.mocked(mockUserAdminRepo.findByUsername).mockResolvedValue({
                id: 'other-admin',
            } as any);
            const uc = new CreateUserAdminUseCase(
                mockUserAdminRepo,
                mockUserDataRepo,
                mockRuleRepo,
            );
            const result = await uc.execute(validInput);
            expect(result.error).toBeDefined();
            expect(result.error?.message).toBe('Username already exists');
        });

        it('falha se userDataId não existir', async () => {
            vi.mocked(mockUserAdminRepo.findByUsername).mockResolvedValue(null);
            vi.mocked(mockUserDataRepo.findById).mockResolvedValue(null);
            const uc = new CreateUserAdminUseCase(
                mockUserAdminRepo,
                mockUserDataRepo,
                mockRuleRepo,
            );
            const result = await uc.execute(validInput);
            expect(result.error).toBeDefined();
            expect(result.error?.message).toBe('Invalid userDataId: user not found');
        });

        it('falha se userData já tiver conta admin', async () => {
            vi.mocked(mockUserAdminRepo.findByUsername).mockResolvedValue(null);
            vi.mocked(mockUserDataRepo.findById).mockResolvedValue({ id: 'ud-001' } as any);
            vi.mocked(mockUserAdminRepo.findByUserDataId).mockResolvedValue({
                id: 'existing-admin',
            } as any);
            const uc = new CreateUserAdminUseCase(
                mockUserAdminRepo,
                mockUserDataRepo,
                mockRuleRepo,
            );
            const result = await uc.execute(validInput);
            expect(result.error).toBeDefined();
            expect(result.error?.message).toBe('This user already has an admin account');
        });

        it('falha se role de destino não existir', async () => {
            vi.mocked(mockUserAdminRepo.findByUsername).mockResolvedValue(null);
            vi.mocked(mockUserDataRepo.findById).mockResolvedValue({ id: 'ud-001' } as any);
            vi.mocked(mockUserAdminRepo.findByUserDataId).mockResolvedValue(null);
            vi.mocked(mockRuleRepo.findById).mockResolvedValue(null);
            const uc = new CreateUserAdminUseCase(
                mockUserAdminRepo,
                mockUserDataRepo,
                mockRuleRepo,
            );
            const result = await uc.execute(validInput);
            expect(result.error).toBeDefined();
            expect(result.error?.message).toBe('Invalid role: permission rule not found');
        });
    });

    describe('criação bem-sucedida', () => {
        it('retorna userAdminId ao criar admin válido', async () => {
            vi.mocked(mockUserAdminRepo.findByUsername).mockResolvedValue(null);
            vi.mocked(mockUserDataRepo.findById).mockResolvedValue({ id: 'ud-001' } as any);
            vi.mocked(mockUserAdminRepo.findByUserDataId).mockResolvedValue(null);
            vi.mocked(mockRuleRepo.findById).mockResolvedValue({ id: 'role-001' } as any);
            vi.mocked(mockUserAdminRepo.create).mockResolvedValue({ id: 'new-admin-001' } as any);
            const uc = new CreateUserAdminUseCase(
                mockUserAdminRepo,
                mockUserDataRepo,
                mockRuleRepo,
            );
            const result = await uc.execute(validInput);
            expect(result.error).toBeUndefined();
            expect(result.userAdminId).toBe('new-admin-001');
        });
    });
});
