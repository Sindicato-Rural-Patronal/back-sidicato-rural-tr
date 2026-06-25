import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AddPropertyUseCase } from '../add-property.js';
import type { UserDataRepository } from '../../ports/external/user-data-repository.js';
import type { PropertyRepository } from '../../ports/external/property-repository.js';
import type { AddressRepository } from '../../ports/external/address-repository.js';

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

const mockPropertyRepo = {
    create: vi.fn(),
    findByUserDataId: vi.fn(),
    findById: vi.fn(),
    delete: vi.fn(),
} as unknown as PropertyRepository;

const mockAddressRepo = {
    create: vi.fn(),
    update: vi.fn(),
    findById: vi.fn(),
    findByCep: vi.fn(),
    delete: vi.fn(),
} as unknown as AddressRepository;

const fakeUser = {
    id: 'user-001',
    name: 'João Silva',
    email: 'joao@example.com',
    phone: '44999990001',
    cpf: '11122233344',
    addressId: null,
};

const fakeAddress = {
    id: 'addr-001',
    type: 'RURAL' as const,
    city: 'Terra Roxa',
    state: 'PR',
    road: 'Estrada Paraguaia',
    km: 'KM 06',
    lot: 'Lote 14',
    section: null,
    localityName: null,
    zipCode: null,
    complement: null,
    notes: null,
    street: null,
    number: null,
    neighborhood: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
};

const fakeProperty = {
    id: 'prop-001',
    userDataId: 'user-001',
    name: 'Fazenda São João',
    registration: 'MAT-123',
    addressId: 'addr-001',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
};

describe('AddPropertyUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('address ausente', () => {
        it('retorna ValidationError se address não fornecido', async () => {
            vi.mocked(mockUserRepo.findById).mockResolvedValue(fakeUser as any);
            const uc = new AddPropertyUseCase(mockUserRepo, mockPropertyRepo, mockAddressRepo);
            const result = await uc.execute({ userDataId: 'user-001',
name: 'Fazenda' } as any);
            expect(result.error).toBeDefined();
            expect(result.error?.message).toBe('Address is required');
            expect(mockPropertyRepo.create).not.toHaveBeenCalled();
        });
    });

    describe('usuário não encontrado', () => {
        it('retorna UserDataNotFoundError se usuário não existir', async () => {
            vi.mocked(mockUserRepo.findById).mockResolvedValue(null);
            const uc = new AddPropertyUseCase(mockUserRepo, mockPropertyRepo, mockAddressRepo);
            const result = await uc.execute({
                userDataId: 'inexistente',
                name: 'Fazenda',
                address: {},
            });
            expect(result.error).toBeDefined();
            expect(result.error?.message).toBe('Invalid userDataId: user not found');
            expect(mockPropertyRepo.create).not.toHaveBeenCalled();
        });
    });

    describe('sucesso com endereço', () => {
        beforeEach(() => {
            vi.mocked(mockUserRepo.findById).mockResolvedValue(fakeUser as any);
            vi.mocked(mockAddressRepo.create).mockResolvedValue(fakeAddress as any);
            vi.mocked(mockPropertyRepo.create).mockResolvedValue(fakeProperty as any);
        });

        it('cria endereço e vincula à propriedade', async () => {
            const uc = new AddPropertyUseCase(mockUserRepo, mockPropertyRepo, mockAddressRepo);
            const result = await uc.execute({
                userDataId: 'user-001',
                name: 'Fazenda São João',
                address: {
                    type: 'RURAL',
                    road: 'Estrada Paraguaia',
                    km: 'KM 06',
                    city: 'Terra Roxa',
                },
            });
            expect(result.error).toBeUndefined();
            expect(mockAddressRepo.create).toHaveBeenCalledTimes(1);
            expect(mockPropertyRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({ addressId: 'addr-001' }),
            );
        });

        it('usa type URBAN por padrão quando não especificado', async () => {
            const uc = new AddPropertyUseCase(mockUserRepo, mockPropertyRepo, mockAddressRepo);
            await uc.execute({
                userDataId: 'user-001',
                name: 'Chácara',
                address: { city: 'Terra Roxa' },
            });
            expect(mockAddressRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'URBAN' }),
            );
        });

        it('retorna a propriedade criada', async () => {
            const uc = new AddPropertyUseCase(mockUserRepo, mockPropertyRepo, mockAddressRepo);
            const result = await uc.execute({
                userDataId: 'user-001',
                name: 'Fazenda São João',
                address: {},
            });
            expect(result.property?.id).toBe('prop-001');
        });
    });

    describe('propriedade com matrícula', () => {
        it('passa registration para propertyRepo.create', async () => {
            vi.mocked(mockUserRepo.findById).mockResolvedValue(fakeUser as any);
            vi.mocked(mockAddressRepo.create).mockResolvedValue(fakeAddress as any);
            vi.mocked(mockPropertyRepo.create).mockResolvedValue(fakeProperty as any);
            const uc = new AddPropertyUseCase(mockUserRepo, mockPropertyRepo, mockAddressRepo);
            await uc.execute({
                userDataId: 'user-001',
                name: 'Fazenda São João',
                registration: 'MAT-123',
                address: { type: 'RURAL',
city: 'Terra Roxa' },
            });
            expect(mockPropertyRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({ registration: 'MAT-123' }),
            );
        });
    });
});
