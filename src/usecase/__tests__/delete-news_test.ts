import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeleteNewsUseCase } from '../delete-news.js';
import type { NewsRepository } from '../../ports/external/news-repository.js';

const mockNewsRepo = {
    create: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    updateBanner: vi.fn(),
} as unknown as NewsRepository;

describe('DeleteNewsUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('verificação da notícia', () => {
        it('falha se notícia não existir', async () => {
            vi.mocked(mockNewsRepo.findById).mockResolvedValue(null);
            const uc = new DeleteNewsUseCase(mockNewsRepo);
            const result = await uc.execute('news-inexistente');
            expect(result.error).toBeDefined();
            expect(result.error?.message).toBe('News not found');
        });

        it('falha se deleção retornar false', async () => {
            vi.mocked(mockNewsRepo.findById).mockResolvedValue({ id: 'news-001' } as any);
            vi.mocked(mockNewsRepo.delete).mockResolvedValue(false);
            const uc = new DeleteNewsUseCase(mockNewsRepo);
            const result = await uc.execute('news-001');
            expect(result.error).toBeDefined();
            expect(result.error?.message).toBe('Failed to delete news');
        });
    });

    describe('deleção bem-sucedida', () => {
        it('retorna success true ao deletar notícia válida', async () => {
            vi.mocked(mockNewsRepo.findById).mockResolvedValue({ id: 'news-001' } as any);
            vi.mocked(mockNewsRepo.delete).mockResolvedValue(true);
            const uc = new DeleteNewsUseCase(mockNewsRepo);
            const result = await uc.execute('news-001');
            expect(result.error).toBeUndefined();
        });
    });
});
