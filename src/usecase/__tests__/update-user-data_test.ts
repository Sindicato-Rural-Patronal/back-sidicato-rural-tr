import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdateUserDataUseCase } from '../update-user-data.js';
import type { UserDataRepository } from '../../ports/external/user-data-repository.js';

const mockUserRepo = {
    create: vi.fn(),
    findById: vi.fn(),
    findByIdWithRelations: vi.fn(),
    findAll: vi.fn(),
    count: vi.fn(),
    findByCpf: vi.fn(),
    findByRg: vi.fn(),
    findByEmailOrCpf: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
} as unknown as UserDataRepository;

const fakeUser = {
    id: 'user-001',
    name: 'João Silva',
    email: 'joao@example.com',
    phone: '44999990001',
    cpf: '11144477735',
    rg: null,
    cnpj: null,
    avatar: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
};

describe('UpdateUserDataUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('validação Zod', () => {
        it('retorna ValidationError se email inválido', async () => {
            vi.mocked(mockUserRepo.findById).mockResolvedValue(fakeUser as any);
            const uc = new UpdateUserDataUseCase(mockUserRepo);
            const result = await uc.execute({ userId: 'user-001',
email: 'nao-e-email' });
            expect(result.error).toBeDefined();
            expect(result.error?.message).toContain('Invalid email');
        });

        it('retorna ValidationError se maritalStatus inválido', async () => {
            vi.mocked(mockUserRepo.findById).mockResolvedValue(fakeUser as any);
            const uc = new UpdateUserDataUseCase(mockUserRepo);
            const result = await uc.execute({
                userId: 'user-001',
                maritalStatus: 'SOLTEIRO' as any,
            });
            expect(result.error).toBeDefined();
            expect(result.error?.message).toContain('Invalid');
        });

        it('retorna ValidationError se gender inválido', async () => {
            vi.mocked(mockUserRepo.findById).mockResolvedValue(fakeUser as any);
            const uc = new UpdateUserDataUseCase(mockUserRepo);
            const result = await uc.execute({ userId: 'user-001',
gender: 'MASCULINO' as any });
            expect(result.error).toBeDefined();
        });

        it('retorna ValidationError se educationLevel inválido', async () => {
            vi.mocked(mockUserRepo.findById).mockResolvedValue(fakeUser as any);
            const uc = new UpdateUserDataUseCase(mockUserRepo);
            const result = await uc.execute({
                userId: 'user-001',
                educationLevel: 'ENSINO_MEDIO' as any,
            });
            expect(result.error).toBeDefined();
        });

        it('retorna ValidationError se memberStatus inválido', async () => {
            vi.mocked(mockUserRepo.findById).mockResolvedValue(fakeUser as any);
            const uc = new UpdateUserDataUseCase(mockUserRepo);
            const result = await uc.execute({ userId: 'user-001',
memberStatus: 'ATIVO' as any });
            expect(result.error).toBeDefined();
        });
    });

    describe('usuário não encontrado', () => {
        it('retorna UserNotFoundError se usuário não existir', async () => {
            vi.mocked(mockUserRepo.findById).mockResolvedValue(null);
            const uc = new UpdateUserDataUseCase(mockUserRepo);
            const result = await uc.execute({ userId: 'inexistente',
name: 'Novo Nome' });
            expect(result.error).toBeDefined();
            expect(result.error?.message).toBe('User not found');
        });
    });

    describe('unicidade de CPF e RG', () => {
        it('retorna erro se CPF já pertencer a outro usuário', async () => {
            vi.mocked(mockUserRepo.findById).mockResolvedValue(fakeUser as any);
            vi.mocked(mockUserRepo.findByCpf).mockResolvedValue({ ...fakeUser,
id: 'outro-user' } as any);
            const uc = new UpdateUserDataUseCase(mockUserRepo);
            const result = await uc.execute({ userId: 'user-001',
cpf: '52998224725' });
            expect(result.error).toBeDefined();
            expect(result.error?.message).toBe('CPF already in use');
        });

        it('não retorna erro se CPF pertencer ao próprio usuário', async () => {
            vi.mocked(mockUserRepo.findById).mockResolvedValue(fakeUser as any);
            vi.mocked(mockUserRepo.findByCpf).mockResolvedValue(fakeUser as any);
            vi.mocked(mockUserRepo.update).mockResolvedValue(fakeUser as any);
            const uc = new UpdateUserDataUseCase(mockUserRepo);
            const result = await uc.execute({ userId: 'user-001',
cpf: '11144477735' });
            expect(result.error).toBeUndefined();
        });

        it('retorna erro se RG já pertencer a outro usuário', async () => {
            vi.mocked(mockUserRepo.findById).mockResolvedValue(fakeUser as any);
            vi.mocked(mockUserRepo.findByRg).mockResolvedValue({ ...fakeUser,
id: 'outro-user' } as any);
            const uc = new UpdateUserDataUseCase(mockUserRepo);
            const result = await uc.execute({ userId: 'user-001',
rg: '123456789' });
            expect(result.error).toBeDefined();
            expect(result.error?.message).toBe('RG already in use');
        });
    });

    describe('atualização bem-sucedida', () => {
        beforeEach(() => {
            vi.mocked(mockUserRepo.findById).mockResolvedValue(fakeUser as any);
            vi.mocked(mockUserRepo.findByCpf).mockResolvedValue(null);
            vi.mocked(mockUserRepo.findByRg).mockResolvedValue(null);
            vi.mocked(mockUserRepo.update).mockResolvedValue(fakeUser as any);
        });

        it('atualiza campos básicos sem erro', async () => {
            const uc = new UpdateUserDataUseCase(mockUserRepo);
            const result = await uc.execute({ userId: 'user-001',
name: 'Maria Santos' });
            expect(result.error).toBeUndefined();
        });

        it('atualiza campos de associado com enums válidos', async () => {
            const uc = new UpdateUserDataUseCase(mockUserRepo);
            const result = await uc.execute({
                userId: 'user-001',
                memberStatus: 'ACTIVE',
                gender: 'MALE',
                educationLevel: 'POSTGRADUATE',
                maritalStatus: 'MARRIED',
                ethnicity: 'WHITE',
            });
            expect(result.error).toBeUndefined();
            expect(mockUserRepo.update).toHaveBeenCalledWith(
                'user-001',
                expect.objectContaining({
                    memberStatus: 'ACTIVE',
                    gender: 'MALE',
                    educationLevel: 'POSTGRADUATE',
                }),
            );
        });

        it('atualiza campos de documentos', async () => {
            const uc = new UpdateUserDataUseCase(mockUserRepo);
            const result = await uc.execute({
                userId: 'user-001',
                rg: '1234567',
                rgIssuer: 'SSP/PR',
                driverLicense: '12345678901',
                driverLicenseCategory: 'B',
                birthPlace: 'Terra Roxa',
                nationality: 'Brasileiro',
            });
            expect(result.error).toBeUndefined();
        });

        it('permite setar campos como null', async () => {
            const uc = new UpdateUserDataUseCase(mockUserRepo);
            const result = await uc.execute({
                userId: 'user-001',
                nickname: null,
                memberStatus: null,
                cpf: null,
            });
            expect(result.error).toBeUndefined();
        });
    });

    describe('falha no repositório', () => {
        it('retorna erro se update retornar null', async () => {
            vi.mocked(mockUserRepo.findById).mockResolvedValue(fakeUser as any);
            vi.mocked(mockUserRepo.update).mockResolvedValue(null);
            const uc = new UpdateUserDataUseCase(mockUserRepo);
            const result = await uc.execute({ userId: 'user-001',
name: 'Novo' });
            expect(result.error).toBeDefined();
            expect(result.error?.message).toBe('Failed to update user');
        });
    });
});
