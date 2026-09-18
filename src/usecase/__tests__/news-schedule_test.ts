import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateNewsUseCase } from '../create-news.js';
import { UpdateNewsUseCase } from '../update-news.js';
import { GetNewsDetailUseCase } from '../get-news-detail.js';
import type { NewsModel, NewsRepository } from '../../ports/external/news-repository.js';

// Agendamento de notícia: "publicar agora" (publishAt null) x "agendar para".
const SCHEDULE = '2026-10-01T08:00:00.000Z'; // 08:00 em Terra Roxa

function makeRepo(existing?: Partial<NewsModel>) {
    const base: NewsModel = {
        id: '11111111-1111-4111-8111-111111111111',
        title: 'Assembleia',
        content: '[]',
        summary: null,
        bannerUrl: null,
        status: 'UNPUBLISHED',
        publishedAt: null,
        publishAt: null,
        createdAt: new Date('2026-09-01T00:00:00.000Z'),
        updatedAt: new Date('2026-09-01T00:00:00.000Z'),
        ...existing,
    };
    return {
        base,
        repo: {
            create: vi.fn(async (data: object) => ({ ...base,
...data })),
            findById: vi.fn().mockResolvedValue(base),
            findAll: vi.fn().mockResolvedValue([]),
            count: vi.fn().mockResolvedValue(0),
            update: vi.fn(async (_id: string, data: object) => ({ ...base,
...data })),
            delete: vi.fn(),
            updateBanner: vi.fn(),
        } as unknown as NewsRepository,
    };
}

describe('CreateNewsUseCase — agendamento', () => {
    beforeEach(() => vi.clearAllMocks());

    it('publicada sem agendamento entra no ar na hora', async () => {
        const { repo } = makeRepo();
        await new CreateNewsUseCase(repo).execute({ title: 'T',
content: '[]',
status: 'PUBLISHED' });
        const data = vi.mocked(repo.create).mock.calls[0][0];
        expect(data.publishAt).toBeNull();
        expect(data.publishedAt).toBeInstanceOf(Date);
    });

    it('agendada guarda publishAt e mostra essa data ao leitor', async () => {
        const { repo } = makeRepo();
        await new CreateNewsUseCase(repo).execute({
            title: 'T',
            content: '[]',
            status: 'PUBLISHED',
            publishAt: SCHEDULE,
        });
        const data = vi.mocked(repo.create).mock.calls[0][0];
        expect(data.publishAt?.toISOString()).toBe(SCHEDULE);
        expect((data.publishedAt as Date).toISOString()).toBe(SCHEDULE);
    });

    it('rascunho não guarda agendamento', async () => {
        const { repo } = makeRepo();
        await new CreateNewsUseCase(repo).execute({
            title: 'T',
            content: '[]',
            status: 'UNPUBLISHED',
            publishAt: SCHEDULE,
        });
        const data = vi.mocked(repo.create).mock.calls[0][0];
        expect(data.publishAt).toBeNull();
        expect(data.publishedAt).toBeUndefined();
    });
});

describe('UpdateNewsUseCase — agendamento', () => {
    beforeEach(() => vi.clearAllMocks());

    it('agendar define publishAt e a data mostrada', async () => {
        const { repo, base } = makeRepo({ status: 'PUBLISHED' });
        await new UpdateNewsUseCase(repo).execute({ newsId: base.id,
publishAt: SCHEDULE });
        const data = vi.mocked(repo.update).mock.calls[0][1];
        expect(data.publishAt?.toISOString()).toBe(SCHEDULE);
        expect((data.publishedAt as Date).toISOString()).toBe(SCHEDULE);
    });

    it('"publicar agora" (publishAt null) limpa o agendamento', async () => {
        const { repo, base } = makeRepo({ status: 'PUBLISHED',
publishAt: new Date(SCHEDULE) });
        await new UpdateNewsUseCase(repo).execute({ newsId: base.id,
publishAt: null });
        expect(vi.mocked(repo.update).mock.calls[0][1].publishAt).toBeNull();
    });

    it('voltar para rascunho descarta o agendamento', async () => {
        const { repo, base } = makeRepo({ status: 'PUBLISHED',
publishAt: new Date(SCHEDULE) });
        await new UpdateNewsUseCase(repo).execute({ newsId: base.id,
status: 'UNPUBLISHED' });
        expect(vi.mocked(repo.update).mock.calls[0][1].publishAt).toBeNull();
    });

    it('sem falar de agendamento, não mexe no que já estava', async () => {
        const { repo, base } = makeRepo({ status: 'PUBLISHED',
publishAt: new Date(SCHEDULE) });
        await new UpdateNewsUseCase(repo).execute({ newsId: base.id,
title: 'Novo título' });
        expect(vi.mocked(repo.update).mock.calls[0][1].publishAt).toBeUndefined();
    });
});

describe('GetNewsDetailUseCase — página pública', () => {
    beforeEach(() => vi.clearAllMocks());

    it('abre a notícia já no ar', async () => {
        const { repo, base } = makeRepo({ status: 'PUBLISHED' });
        const r = await new GetNewsDetailUseCase(repo).execute(base.id, new Date(SCHEDULE));
        expect(r.error).toBeUndefined();
        expect(r.news?.id).toBe(base.id);
    });

    it('agendada para depois dá 404 mesmo com o link', async () => {
        const { repo, base } = makeRepo({ status: 'PUBLISHED',
publishAt: new Date('2026-10-02T08:00:00.000Z') });
        const r = await new GetNewsDetailUseCase(repo).execute(base.id, new Date(SCHEDULE));
        expect(r.error).toBeDefined();
        expect(r.news).toBeUndefined();
    });

    it('rascunho continua fora do site', async () => {
        const { repo, base } = makeRepo({ status: 'UNPUBLISHED' });
        const r = await new GetNewsDetailUseCase(repo).execute(base.id, new Date(SCHEDULE));
        expect(r.error).toBeDefined();
    });
});
