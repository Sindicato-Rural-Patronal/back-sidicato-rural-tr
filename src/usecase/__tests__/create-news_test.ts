import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateNewsUseCase } from '../create-news.js';
import type { NewsRepository } from '../../ports/external/news-repository.js';

const mockNewsRepo = {
    create: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    updateBanner: vi.fn(),
} as unknown as NewsRepository;

const validInput = {
    title: 'Assembleia Geral',
    content: 'Conteúdo da notícia...',
};

describe('CreateNewsUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('validação de input', () => {
        it('falha se título estiver vazio', async () => {
            const uc = new CreateNewsUseCase(mockNewsRepo);
            const result = await uc.execute({ ...validInput,
title: '' });
            expect(result.error).toBeDefined();
            expect(result.error?.message).toContain('Title is required');
        });

        it('falha se conteúdo estiver vazio', async () => {
            const uc = new CreateNewsUseCase(mockNewsRepo);
            const result = await uc.execute({ ...validInput,
content: '' });
            expect(result.error).toBeDefined();
            expect(result.error?.message).toContain('Content is required');
        });
    });

    describe('regra de publishedAt automático', () => {
        it('sets publishedAt automatically when status is PUBLISHED without explicit date', async () => {
            vi.mocked(mockNewsRepo.create).mockResolvedValue({ id: 'news-001' } as any);
            const uc = new CreateNewsUseCase(mockNewsRepo);
            await uc.execute({ ...validInput,
status: 'PUBLISHED' });
            const createCall = vi.mocked(mockNewsRepo.create).mock.calls[0][0];
            expect(createCall.publishedAt).toBeInstanceOf(Date);
        });

        it('does not set publishedAt when status is UNPUBLISHED', async () => {
            vi.mocked(mockNewsRepo.create).mockResolvedValue({ id: 'news-002' } as any);
            const uc = new CreateNewsUseCase(mockNewsRepo);
            await uc.execute({ ...validInput,
status: 'UNPUBLISHED' });
            const createCall = vi.mocked(mockNewsRepo.create).mock.calls[0][0];
            expect(createCall.publishedAt).toBeUndefined();
        });

        it('respeita publishedAt explícita se fornecida', async () => {
            vi.mocked(mockNewsRepo.create).mockResolvedValue({ id: 'news-003' } as any);
            const uc = new CreateNewsUseCase(mockNewsRepo);
            await uc.execute({
                ...validInput,
                status: 'PUBLISHED',
                publishedAt: '2026-01-01T10:00:00.000Z',
            });
            const createCall = vi.mocked(mockNewsRepo.create).mock.calls[0][0];
            expect(createCall.publishedAt?.toISOString()).toBe('2026-01-01T10:00:00.000Z');
        });

        it('default status is UNPUBLISHED when not provided', async () => {
            vi.mocked(mockNewsRepo.create).mockResolvedValue({ id: 'news-004' } as any);
            const uc = new CreateNewsUseCase(mockNewsRepo);
            await uc.execute(validInput);
            const createCall = vi.mocked(mockNewsRepo.create).mock.calls[0][0];
            expect(createCall.status).toBe('UNPUBLISHED');
        });
    });

    describe('criação bem-sucedida', () => {
        it('retorna newsId ao criar notícia válida', async () => {
            vi.mocked(mockNewsRepo.create).mockResolvedValue({ id: 'news-abc' } as any);
            const uc = new CreateNewsUseCase(mockNewsRepo);
            const result = await uc.execute(validInput);
            expect(result.error).toBeUndefined();
            expect(result.newsId).toBe('news-abc');
        });
    });
});
