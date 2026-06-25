import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AddUserRelationUseCase } from '../add-user-relation.js';
import type { UserDataRepository } from '../../ports/external/user-data-repository.js';
import type { UserRelationRepository } from '../../ports/external/user-relation-repository.js';

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

const mockRelationRepo = {
    create: vi.fn(),
    findBySourceId: vi.fn(),
    countBySourceId: vi.fn().mockResolvedValue(0),
    findById: vi.fn(),
    findBySourceAndTarget: vi.fn(),
    delete: vi.fn(),
} as unknown as UserRelationRepository;

const fakeSource = {
    id: 'user-001',
    name: 'João Silva',
    email: 'joao@example.com',
    phone: '44999990001',
    cpf: '11122233344',
};

const fakeTarget = {
    id: 'user-002',
    name: 'Maria Silva',
    email: 'maria@example.com',
    phone: '44999990002',
    cpf: '99988877766',
};

const fakeRelation = {
    id: 'rel-001',
    sourceId: 'user-001',
    targetId: 'user-002',
    label: 'conjugue',
    createdAt: new Date('2026-01-01'),
};

describe('AddUserRelationUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('usuário de origem não encontrado', () => {
        it('retorna UserDataNotFoundError se source não existir', async () => {
            vi.mocked(mockUserRepo.findById).mockResolvedValueOnce(null);
            const uc = new AddUserRelationUseCase(mockUserRepo, mockRelationRepo);
            const result = await uc.execute('inexistente', 'user-002', 'conjugue');
            expect(result.error).toBeDefined();
            expect(result.error?.message).toBe('Invalid userDataId: user not found');
            expect(mockRelationRepo.create).not.toHaveBeenCalled();
        });
    });

    describe('usuário de destino não encontrado', () => {
        it('retorna UserDataNotFoundError se target não existir', async () => {
            vi.mocked(mockUserRepo.findById)
                .mockResolvedValueOnce(fakeSource as any)
                .mockResolvedValueOnce(null);
            const uc = new AddUserRelationUseCase(mockUserRepo, mockRelationRepo);
            const result = await uc.execute('user-001', 'inexistente', 'filho');
            expect(result.error).toBeDefined();
            expect(result.error?.message).toBe('Invalid userDataId: user not found');
            expect(mockRelationRepo.create).not.toHaveBeenCalled();
        });
    });

    describe('criação bem-sucedida', () => {
        beforeEach(() => {
            vi.mocked(mockUserRepo.findById)
                .mockResolvedValueOnce(fakeSource as any)
                .mockResolvedValueOnce(fakeTarget as any);
        });

        it('cria relação com label e retorna objeto', async () => {
            vi.mocked(mockRelationRepo.create).mockResolvedValue(fakeRelation as any);
            const uc = new AddUserRelationUseCase(mockUserRepo, mockRelationRepo);
            const result = await uc.execute('user-001', 'user-002', 'conjugue');
            expect(result.error).toBeUndefined();
            expect(result.relation?.id).toBe('rel-001');
            expect(result.relation?.label).toBe('conjugue');
        });

        it('cria relação sem label', async () => {
            vi.mocked(mockRelationRepo.create).mockResolvedValue({
                ...fakeRelation,
                label: undefined,
            } as any);
            const uc = new AddUserRelationUseCase(mockUserRepo, mockRelationRepo);
            const result = await uc.execute('user-001', 'user-002');
            expect(result.error).toBeUndefined();
            expect(mockRelationRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({ sourceId: 'user-001',
targetId: 'user-002' }),
            );
        });

        it('chama create com sourceId e targetId corretos', async () => {
            vi.mocked(mockRelationRepo.create).mockResolvedValue(fakeRelation as any);
            const uc = new AddUserRelationUseCase(mockUserRepo, mockRelationRepo);
            await uc.execute('user-001', 'user-002', 'sócio');
            expect(mockRelationRepo.create).toHaveBeenCalledWith({
                sourceId: 'user-001',
                targetId: 'user-002',
                label: 'sócio',
            });
        });
    });
});
