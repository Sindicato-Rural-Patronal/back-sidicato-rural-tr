import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateUserAdminUseCase } from '../create-user-admin.js';
import { AdminAccountAlreadyExistsError, UsernameAlreadyExistsError } from '../../errors/conflict.js';
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

    describe('corrida: o P2002 diz qual índice estourou (SR-069)', () => {
        // Com o @prisma/adapter-pg o P2002 vem sem `meta.target`; o índice está
        // em `meta.driverAdapterError.cause.constraint.index`.
        const adapterP2002 = (index: string) => ({
            code: 'P2002',
            meta: { driverAdapterError: { cause: { constraint: { index } } } },
        });

        beforeEach(() => {
            vi.mocked(mockUserAdminRepo.findByUsername).mockResolvedValue(null);
            vi.mocked(mockUserDataRepo.findById).mockResolvedValue({ id: 'ud-001' } as any);
            vi.mocked(mockUserAdminRepo.findByUserDataIdAny).mockResolvedValue(null);
            vi.mocked(mockRuleRepo.findById).mockResolvedValue({ id: 'role-001',
permissions: [] } as any);
        });
        const run = () =>
            new CreateUserAdminUseCase(mockUserAdminRepo, mockUserDataRepo, mockRuleRepo).execute(validInput);

        it('índice do usuário → "usuário já existe"', async () => {
            vi.mocked(mockUserAdminRepo.create).mockRejectedValue(adapterP2002('UserAdmin_username_active_key'));
            expect((await run()).error).toBeInstanceOf(UsernameAlreadyExistsError);
        });

        it('índice da pessoa → "esta pessoa já tem conta de administrador"', async () => {
            vi.mocked(mockUserAdminRepo.create).mockRejectedValue(adapterP2002('UserAdmin_userDataId_key'));
            expect((await run()).error).toBeInstanceOf(AdminAccountAlreadyExistsError);
        });

        it('o `meta.target` do Prisma sem adapter também vale', async () => {
            vi.mocked(mockUserAdminRepo.create).mockRejectedValue({ code: 'P2002',
meta: { target: ['userDataId'] } });
            expect((await run()).error).toBeInstanceOf(AdminAccountAlreadyExistsError);
        });

        it('sem dizer o índice, fica o do usuário', async () => {
            vi.mocked(mockUserAdminRepo.create).mockRejectedValue({ code: 'P2002' });
            expect((await run()).error).toBeInstanceOf(UsernameAlreadyExistsError);
        });

        it('a reativação (pessoa com conta excluída) só pode estourar o do usuário', async () => {
            vi.mocked(mockUserAdminRepo.findByUserDataIdAny).mockResolvedValue({ id: 'old',
isDeleted: true } as any);
            vi.mocked(mockUserAdminRepo.reactivate).mockRejectedValue(adapterP2002('UserAdmin_username_active_key'));
            expect((await run()).error).toBeInstanceOf(UsernameAlreadyExistsError);
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
