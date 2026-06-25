import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeletePropertyUseCase } from '../delete-property.js';
import type { PropertyRepository } from '../../ports/external/property-repository.js';

const mockPropertyRepo = {
    create: vi.fn(),
    findByUserDataId: vi.fn(),
    findById: vi.fn(),
    delete: vi.fn(),
} as unknown as PropertyRepository;

const fakeProperty = {
    id: 'prop-001',
    userDataId: 'user-001',
    name: 'Fazenda São João',
    registration: 'MAT-123',
    addressId: null,
    createdAt: new Date('2026-01-01'),
};

describe('DeletePropertyUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('propriedade não encontrada', () => {
        it('retorna PropertyNotFoundError se propriedade não existir', async () => {
            vi.mocked(mockPropertyRepo.findById).mockResolvedValue(null);
            const uc = new DeletePropertyUseCase(mockPropertyRepo);
            const result = await uc.execute('inexistente', 'user-001');
            expect(result.error).toBeDefined();
            expect(result.error?.message).toBe('Property not found');
        });

        it('não chama delete se propriedade não existir', async () => {
            vi.mocked(mockPropertyRepo.findById).mockResolvedValue(null);
            const uc = new DeletePropertyUseCase(mockPropertyRepo);
            await uc.execute('inexistente', 'user-001');
            expect(mockPropertyRepo.delete).not.toHaveBeenCalled();
        });
    });

    describe('exclusão bem-sucedida', () => {
        it('deleta propriedade e retorna sem erro', async () => {
            vi.mocked(mockPropertyRepo.findById).mockResolvedValue(fakeProperty as any);
            vi.mocked(mockPropertyRepo.delete).mockResolvedValue(undefined);
            const uc = new DeletePropertyUseCase(mockPropertyRepo);
            const result = await uc.execute('prop-001', 'user-001');
            expect(result.error).toBeUndefined();
            expect(mockPropertyRepo.delete).toHaveBeenCalledWith('prop-001');
        });

        it('chama findById com propertyId correto', async () => {
            vi.mocked(mockPropertyRepo.findById).mockResolvedValue(fakeProperty as any);
            vi.mocked(mockPropertyRepo.delete).mockResolvedValue(undefined);
            const uc = new DeletePropertyUseCase(mockPropertyRepo);
            await uc.execute('prop-001', 'user-001');
            expect(mockPropertyRepo.findById).toHaveBeenCalledWith('prop-001');
        });

        it('retorna PropertyNotFoundError se propertyId não pertencer ao userId', async () => {
            vi.mocked(mockPropertyRepo.findById).mockResolvedValue(fakeProperty as any);
            const uc = new DeletePropertyUseCase(mockPropertyRepo);
            const result = await uc.execute('prop-001', 'outro-user');
            expect(result.error).toBeDefined();
            expect(mockPropertyRepo.delete).not.toHaveBeenCalled();
        });
    });
});
