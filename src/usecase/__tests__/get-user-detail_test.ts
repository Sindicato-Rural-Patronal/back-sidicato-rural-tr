import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetUserDetailUseCase } from '../get-user-detail.js';
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

const fakeAddress = {
    id: 'addr-001',
    type: 'URBAN' as const,
    city: 'Terra Roxa',
    state: 'PR',
    zipCode: '85990-000',
    street: 'Av da Saudade',
    number: '991',
    neighborhood: 'Centro',
    complement: null,
    notes: null,
    localityName: null,
    road: null,
    km: null,
    lot: null,
    section: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
};

const fakeRelation = {
    id: 'rel-001',
    sourceId: 'user-001',
    targetId: 'user-002',
    label: 'conjugue',
    createdAt: new Date('2026-01-01'),
    target: { id: 'user-002',
name: 'Maria Silva',
cpf: '99988877766' },
};

const fakeProperty = {
    id: 'prop-001',
    userDataId: 'user-001',
    name: 'Fazenda São João',
    registration: 'MAT-123',
    addressId: 'addr-002',
    createdAt: new Date('2026-01-01'),
    address: null,
};

const fakeUserWithRelations = {
    id: 'user-001',
    name: 'João Silva',
    email: 'joao@example.com',
    phone: '44999990001',
    cpf: '11122233344',
    cnpj: null,
    avatar: null,
    addressId: 'addr-001',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    address: fakeAddress,
    relations: [fakeRelation],
    properties: [fakeProperty],
};

describe('GetUserDetailUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('usuário não encontrado', () => {
        it('retorna UserDataNotFoundError se usuário não existir', async () => {
            vi.mocked(mockUserRepo.findByIdWithRelations).mockResolvedValue(null);
            const uc = new GetUserDetailUseCase(mockUserRepo);
            const result = await uc.execute('inexistente');
            expect(result.error).toBeDefined();
            expect(result.error?.message).toBe('Invalid userDataId: user not found');
        });

        it('não retorna user se não encontrado', async () => {
            vi.mocked(mockUserRepo.findByIdWithRelations).mockResolvedValue(null);
            const uc = new GetUserDetailUseCase(mockUserRepo);
            const result = await uc.execute('inexistente');
            expect(result.user).toBeUndefined();
        });
    });

    describe('busca bem-sucedida', () => {
        beforeEach(() => {
            vi.mocked(mockUserRepo.findByIdWithRelations).mockResolvedValue(
                fakeUserWithRelations as any,
            );
        });

        it('retorna o usuário com endereço', async () => {
            const uc = new GetUserDetailUseCase(mockUserRepo);
            const result = await uc.execute('user-001');
            expect(result.error).toBeUndefined();
            expect(result.user?.address?.city).toBe('Terra Roxa');
            expect(result.user?.address?.type).toBe('URBAN');
        });

        it('retorna as relações com dados básicos do destino', async () => {
            const uc = new GetUserDetailUseCase(mockUserRepo);
            const result = await uc.execute('user-001');
            expect(result.user?.relations).toHaveLength(1);
            expect(result.user?.relations[0].label).toBe('conjugue');
            expect(result.user?.relations[0].target.name).toBe('Maria Silva');
            expect(result.user?.relations[0].target.cpf).toBe('99988877766');
        });

        it('retorna as propriedades do usuário', async () => {
            const uc = new GetUserDetailUseCase(mockUserRepo);
            const result = await uc.execute('user-001');
            expect(result.user?.properties).toHaveLength(1);
            expect(result.user?.properties[0].name).toBe('Fazenda São João');
        });

        it('chama findByIdWithRelations com o userId correto', async () => {
            const uc = new GetUserDetailUseCase(mockUserRepo);
            await uc.execute('user-001');
            expect(mockUserRepo.findByIdWithRelations).toHaveBeenCalledWith('user-001');
        });
    });
});
