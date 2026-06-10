import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListNewsUseCase } from '../list-news.js';
import type { NewsRepository } from '../../ports/external/news-repository.js';

const mockNewsRepo = {
    create: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
    update: vi.fn(),
    delete: vi.fn(),
    updateBanner: vi.fn(),
} as unknown as NewsRepository;

describe('ListNewsUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('filtro de status', () => {
        it('passa filtro PUBLICADO ao repositório quando informado', async () => {
            vi.mocked(mockNewsRepo.findAll).mockResolvedValue([]);
            const uc = new ListNewsUseCase(mockNewsRepo);
            await uc.execute('PUBLICADO');
            expect(mockNewsRepo.findAll).toHaveBeenCalledWith('PUBLICADO', 0, 20);
        });

        it('busca todas as notícias quando filtro não informado', async () => {
            vi.mocked(mockNewsRepo.findAll).mockResolvedValue([]);
            const uc = new ListNewsUseCase(mockNewsRepo);
            await uc.execute();
            expect(mockNewsRepo.findAll).toHaveBeenCalledWith(undefined, 0, 20);
        });

        it('retorna lista de notícias', async () => {
            const fakeNews = [
                { id: 'n1',
title: 'Notícia 1' },
                { id: 'n2',
title: 'Notícia 2' },
            ];
            vi.mocked(mockNewsRepo.findAll).mockResolvedValue(fakeNews as any);
            const uc = new ListNewsUseCase(mockNewsRepo);
            const result = await uc.execute();
            expect(result.error).toBeUndefined();
            expect(result.result?.data).toHaveLength(2);
        });
    });
});
