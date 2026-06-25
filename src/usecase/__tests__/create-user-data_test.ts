import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateUserUseCase } from '../create-user-data.js';
import type { UserDataRepository } from '../../ports/external/user-data-repository.js';

const mockUserRepo = {
    create: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    findByCpf: vi.fn(),
    findByRg: vi.fn(),
    findByEmailOrCpf: vi.fn(),
} as unknown as UserDataRepository;

const validInput = {
    name: 'João Silva',
    email: 'joao@example.com',
    phone: '11999998888',
    cpf: '52998224725',
};

const fakeUser = {
    id: 'user-123',
    name: validInput.name,
    email: validInput.email,
    phone: validInput.phone,
    cpf: validInput.cpf,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    avatar: null,
    cnpj: null,
};

describe('CreateUserUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('unicidade de CPF', () => {
        it('retorna erro se CPF já cadastrado', async () => {
            vi.mocked(mockUserRepo.findByCpf).mockResolvedValue(fakeUser as any);
            const uc = new CreateUserUseCase(mockUserRepo);
            const result = await uc.execute(validInput);
            expect(result.error).toBeDefined();
            expect(result.error?.message).toBe('User already exists');
        });

        it('não cria usuário se CPF duplicado', async () => {
            vi.mocked(mockUserRepo.findByCpf).mockResolvedValue(fakeUser as any);
            const uc = new CreateUserUseCase(mockUserRepo);
            await uc.execute(validInput);
            expect(mockUserRepo.create).not.toHaveBeenCalled();
        });
    });

    describe('criação bem-sucedida', () => {
        it('retorna dados do usuário criado', async () => {
            vi.mocked(mockUserRepo.findByCpf).mockResolvedValue(null);
            vi.mocked(mockUserRepo.create).mockResolvedValue(fakeUser as any);
            const uc = new CreateUserUseCase(mockUserRepo);
            const result = await uc.execute(validInput);
            expect(result.error).toBeUndefined();
            expect(result.data?.id).toBe('user-123');
            expect(result.data?.email).toBe(validInput.email);
            expect(result.error).toBeUndefined();
        });
    });

    describe('falha no repositório', () => {
        it('retorna erro se repositório falhar na criação', async () => {
            vi.mocked(mockUserRepo.findByCpf).mockResolvedValue(null);
            vi.mocked(mockUserRepo.create).mockResolvedValue(null);
            const uc = new CreateUserUseCase(mockUserRepo);
            const result = await uc.execute(validInput);
            expect(result.error).toBeDefined();
            expect(result.error?.message).toBe('Failed to create user');
        });
    });
});
