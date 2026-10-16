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
    findByUserDataIdAny: vi.fn(),
    reactivate: vi.fn(),
    update: vi.fn(),
    findAll: vi.fn(),
} as unknown as UserAdminRepository;

const mockUserDataRepo = {
    create: vi.fn(),
    findById: vi.fn(),
    findByCpf: vi.fn(),
    findByRg: vi.fn(),
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
            vi.mocked(mockUserAdminRepo.findByUserDataIdAny).mockResolvedValue({
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
            vi.mocked(mockUserAdminRepo.findByUserDataIdAny).mockResolvedValue(null);
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
            vi.mocked(mockUserAdminRepo.findByUserDataIdAny).mockResolvedValue(null);
            vi.mocked(mockRuleRepo.findById).mockResolvedValue({ id: 'role-001',
permissions: [] } as any);
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

    describe('anti-escalonamento e validação', () => {
        const uc = () => new CreateUserAdminUseCase(mockUserAdminRepo, mockUserDataRepo, mockRuleRepo);

        beforeEach(() => {
            vi.mocked(mockUserAdminRepo.findByUsername).mockResolvedValue(null);
            vi.mocked(mockUserDataRepo.findById).mockResolvedValue({ id: 'ud-001' } as any);
            vi.mocked(mockUserAdminRepo.findByUserDataIdAny).mockResolvedValue(null);
            vi.mocked(mockUserAdminRepo.create).mockResolvedValue({ id: 'new-admin-001' } as any);
        });

        it('recusa atribuir regra com permissões além das do ator', async () => {
            vi.mocked(mockRuleRepo.findById).mockResolvedValue({ id: 'role-001',
permissions: ['READ_USER', 'DELETE_USER_ADMIN'] } as any);
            const result = await uc().execute(validInput, ['READ_USER', 'CREATE_USER_ADMIN']);
            expect(result.error?.name).toBe('ForbiddenError');
            expect(mockUserAdminRepo.create).not.toHaveBeenCalled();
        });

        it('aceita regra contida nas permissões do ator', async () => {
            vi.mocked(mockRuleRepo.findById).mockResolvedValue({ id: 'role-001',
permissions: ['READ_USER'] } as any);
            const result = await uc().execute(validInput, ['READ_USER', 'CREATE_USER_ADMIN']);
            expect(result.error).toBeUndefined();
        });

        it.each(['', '1234567'])('recusa senha com menos de 8 caracteres (%j)', async password => {
            vi.mocked(mockRuleRepo.findById).mockResolvedValue({ id: 'role-001',
permissions: [] } as any);
            const result = await uc().execute({ ...validInput,
password });
            expect(result.error?.name).toBe('ValidationError');
            expect(result.error?.message).toBe('A senha deve ter ao menos 8 caracteres.');
            expect(mockUserAdminRepo.create).not.toHaveBeenCalled();
        });

        it.each(['', '   '])('recusa usuário vazio (%j)', async username => {
            const result = await uc().execute({ ...validInput,
username });
            expect(result.error?.message).toBe('Informe o usuário.');
            expect(mockUserAdminRepo.create).not.toHaveBeenCalled();
        });

        it('grava o usuário sem os espaços das pontas', async () => {
            vi.mocked(mockRuleRepo.findById).mockResolvedValue({ id: 'role-001',
permissions: [] } as any);
            await uc().execute({ ...validInput,
username: '  novo.admin  ' });
            expect(mockUserAdminRepo.findByUsername).toHaveBeenCalledWith('novo.admin');
            expect(vi.mocked(mockUserAdminRepo.create).mock.calls[0][0].username).toBe('novo.admin');
        });
    });
});
