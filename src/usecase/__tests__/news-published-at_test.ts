import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CreateNewsUseCase } from '../create-news.js';
import { UpdateNewsUseCase } from '../update-news.js';
import type { NewsRepository } from '../../ports/external/news-repository.js';

const repo = {
    create: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
} as unknown as NewsRepository;

const NEWS_ID = '11111111-1111-4111-8111-111111111111';

// 15/10/2026 às 22:30 em Brasília = 16/10 01:30 UTC. Com o instante real, a
// notícia saía com a data de 16/10 no site.
const REAL_NOW = new Date('2026-10-16T01:30:00.000Z');
const WALL_NOW = new Date('2026-10-15T22:30:00.000Z');

function existing(over: Partial<{
 status: string;
publishAt: Date | null;
publishedAt: Date | null 
}>) {
    return { id: NEWS_ID,
title: 'T',
content: 'C',
status: 'PUBLISHED',
publishAt: null,
publishedAt: null,
...over } as never;
}

const sentToUpdate = () => vi.mocked(repo.update).mock.calls[0][1];

describe('publishedAt da notícia (hora de parede de Brasília)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.setSystemTime(REAL_NOW);
        vi.mocked(repo.create).mockImplementation(async data => ({ id: NEWS_ID,
...data }) as never);
        vi.mocked(repo.update).mockResolvedValue({ id: NEWS_ID } as never);
    });
    afterEach(() => vi.useRealTimers());

    it('publicar agora na criação grava o relógio de Brasília', async () => {
        await new CreateNewsUseCase(repo).execute({ title: 'T',
content: 'C',
status: 'PUBLISHED' });
        expect(vi.mocked(repo.create).mock.calls[0][0].publishedAt).toEqual(WALL_NOW);
    });

    it('"publicar agora" uma agendada troca a data futura por agora', async () => {
        const dec1 = new Date('2026-12-01T08:00:00.000Z');
        vi.mocked(repo.findById).mockResolvedValue(existing({ publishAt: dec1,
publishedAt: dec1 }));
        await new UpdateNewsUseCase(repo).execute({ newsId: NEWS_ID,
status: 'PUBLISHED',
publishAt: null });
        expect(sentToUpdate()).toMatchObject({ publishAt: null,
publishedAt: WALL_NOW });
    });

    it('agendada → rascunho → publicar agora também volta para hoje', async () => {
        // Rascunho guarda a data do agendamento antigo em publishedAt.
        vi.mocked(repo.findById).mockResolvedValue(existing({ status: 'UNPUBLISHED',
publishedAt: new Date('2026-12-01T08:00:00.000Z') }));
        await new UpdateNewsUseCase(repo).execute({ newsId: NEWS_ID,
status: 'PUBLISHED' });
        expect(sentToUpdate().publishedAt).toEqual(WALL_NOW);
    });

    it('rascunho publicado pela primeira vez ganha a data de hoje', async () => {
        vi.mocked(repo.findById).mockResolvedValue(existing({ status: 'UNPUBLISHED' }));
        await new UpdateNewsUseCase(repo).execute({ newsId: NEWS_ID,
status: 'PUBLISHED' });
        expect(sentToUpdate().publishedAt).toEqual(WALL_NOW);
    });

    it('notícia que já estava no ar mantém a data ao ser editada', async () => {
        vi.mocked(repo.findById).mockResolvedValue(existing({ publishedAt: new Date('2026-09-01T10:00:00.000Z') }));
        await new UpdateNewsUseCase(repo).execute({ newsId: NEWS_ID,
title: 'Novo título' });
        expect(sentToUpdate().publishedAt).toBeUndefined();
    });

    it('agendada continua agendada ao editar só o texto', async () => {
        const dec1 = new Date('2026-12-01T08:00:00.000Z');
        vi.mocked(repo.findById).mockResolvedValue(existing({ publishAt: dec1,
publishedAt: dec1 }));
        await new UpdateNewsUseCase(repo).execute({ newsId: NEWS_ID,
content: 'Outro' });
        expect(sentToUpdate()).toMatchObject({ publishAt: undefined,
publishedAt: undefined });
    });

    it('reagendar troca a data mostrada pela do agendamento', async () => {
        vi.mocked(repo.findById).mockResolvedValue(existing({ publishedAt: new Date('2026-09-01T10:00:00.000Z') }));
        await new UpdateNewsUseCase(repo).execute({ newsId: NEWS_ID,
publishAt: '2026-11-05T09:00:00.000Z' });
        expect(sentToUpdate()).toMatchObject({ publishAt: new Date('2026-11-05T09:00:00.000Z'),
publishedAt: new Date('2026-11-05T09:00:00.000Z') });
    });

    it('PATCH sem status num rascunho não guarda agendamento', async () => {
        vi.mocked(repo.findById).mockResolvedValue(existing({ status: 'UNPUBLISHED' }));
        await new UpdateNewsUseCase(repo).execute({ newsId: NEWS_ID,
publishAt: '2026-12-01T08:00:00.000Z' });
        expect(sentToUpdate()).toMatchObject({ publishAt: null,
publishedAt: undefined });
    });

    it('data mandada no corpo vale mais que a regra', async () => {
        vi.mocked(repo.findById).mockResolvedValue(existing({}));
        await new UpdateNewsUseCase(repo).execute({ newsId: NEWS_ID,
publishedAt: '2026-08-10T08:00:00.000Z' });
        expect(sentToUpdate().publishedAt).toEqual(new Date('2026-08-10T08:00:00.000Z'));
    });
});
