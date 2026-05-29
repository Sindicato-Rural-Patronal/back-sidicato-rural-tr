import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetNewsDetailUseCase } from '../get-news-detail.js';
import type { NewsRepository } from '../../ports/external/news-repository.js';

const mockNewsRepo = {
    create: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    updateBanner: vi.fn(),
} as unknown as NewsRepository;

describe('GetNewsDetailUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('busca de notícia', () => {
        it('falha se notícia não existir', async () => {
            vi.mocked(mockNewsRepo.findById).mockResolvedValue(null);
            const uc = new GetNewsDetailUseCase(mockNewsRepo);
            const result = await uc.execute('news-inexistente');
            expect(result.success).toBe(false);
            expect(result.error?.message).toBe('News not found');
        });

        it('retorna notícia ao encontrar', async () => {
            const fakeNews = { id: 'news-001', title: 'Assembleia', content: 'Conteúdo' };
            vi.mocked(mockNewsRepo.findById).mockResolvedValue(fakeNews as any);
            const uc = new GetNewsDetailUseCase(mockNewsRepo);
            const result = await uc.execute('news-001');
            expect(result.success).toBe(true);
            expect(result.news?.id).toBe('news-001');
            expect(result.news?.title).toBe('Assembleia');
        });
    });
});
