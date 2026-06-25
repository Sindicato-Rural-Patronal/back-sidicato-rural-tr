import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeleteUserRelationUseCase } from '../delete-user-relation.js';
import type { UserRelationRepository } from '../../ports/external/user-relation-repository.js';

const mockRelationRepo = {
    create: vi.fn(),
    findBySourceId: vi.fn(),
    countBySourceId: vi.fn().mockResolvedValue(0),
    findById: vi.fn(),
    findBySourceAndTarget: vi.fn(),
    delete: vi.fn(),
} as unknown as UserRelationRepository;

const fakeRelation = {
    id: 'rel-001',
    sourceId: 'user-001',
    targetId: 'user-002',
    label: 'conjugue',
    createdAt: new Date('2026-01-01'),
};

describe('DeleteUserRelationUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('relação não encontrada', () => {
        it('retorna UserRelationNotFoundError se relação não existir', async () => {
            vi.mocked(mockRelationRepo.findById).mockResolvedValue(null);
            const uc = new DeleteUserRelationUseCase(mockRelationRepo);
            const result = await uc.execute('inexistente', 'user-001');
            expect(result.error).toBeDefined();
            expect(result.error?.message).toBe('User relation not found');
        });

        it('não chama delete se relação não existir', async () => {
            vi.mocked(mockRelationRepo.findById).mockResolvedValue(null);
            const uc = new DeleteUserRelationUseCase(mockRelationRepo);
            await uc.execute('inexistente', 'user-001');
            expect(mockRelationRepo.delete).not.toHaveBeenCalled();
        });
    });

    describe('exclusão bem-sucedida', () => {
        it('deleta relação e retorna sem erro', async () => {
            vi.mocked(mockRelationRepo.findById).mockResolvedValue(fakeRelation as any);
            vi.mocked(mockRelationRepo.delete).mockResolvedValue(undefined);
            const uc = new DeleteUserRelationUseCase(mockRelationRepo);
            const result = await uc.execute('rel-001', 'user-001');
            expect(result.error).toBeUndefined();
            expect(mockRelationRepo.delete).toHaveBeenCalledWith('rel-001');
        });

        it('chama findById com o relationId correto', async () => {
            vi.mocked(mockRelationRepo.findById).mockResolvedValue(fakeRelation as any);
            vi.mocked(mockRelationRepo.delete).mockResolvedValue(undefined);
            const uc = new DeleteUserRelationUseCase(mockRelationRepo);
            await uc.execute('rel-001', 'user-001');
            expect(mockRelationRepo.findById).toHaveBeenCalledWith('rel-001');
        });

        it('retorna UserRelationNotFoundError se relationId não pertencer ao userId', async () => {
            vi.mocked(mockRelationRepo.findById).mockResolvedValue(fakeRelation as any);
            const uc = new DeleteUserRelationUseCase(mockRelationRepo);
            const result = await uc.execute('rel-001', 'outro-user');
            expect(result.error).toBeDefined();
            expect(mockRelationRepo.delete).not.toHaveBeenCalled();
        });
    });
});
