import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdateNewsUseCase } from '../update-news.js';
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
    newsId: '123e4567-e89b-12d3-a456-426614174000',
    title: 'Novo Título',
};

describe('UpdateNewsUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('validação de input', () => {
        it('falha se newsId não for UUID válido', async () => {
            const uc = new UpdateNewsUseCase(mockNewsRepo);
            const result = await uc.execute({ ...validInput,
newsId: 'nao-e-uuid' });
            expect(result.error).toBeDefined();
        });
    });

    describe('verificação da notícia', () => {
        it('falha se notícia não existir', async () => {
            vi.mocked(mockNewsRepo.findById).mockResolvedValue(null);
            const uc = new UpdateNewsUseCase(mockNewsRepo);
            const result = await uc.execute(validInput);
            expect(result.error).toBeDefined();
            expect(result.error?.message).toBe('News not found');
        });
    });

    describe('regra de publishedAt automático', () => {
        it('define publishedAt ao publicar notícia que ainda não tinha data', async () => {
            vi.mocked(mockNewsRepo.findById).mockResolvedValue({
                id: validInput.newsId,
                publishedAt: null,
            } as any);
            vi.mocked(mockNewsRepo.update).mockResolvedValue({ id: validInput.newsId } as any);
            const uc = new UpdateNewsUseCase(mockNewsRepo);
            await uc.execute({ ...validInput,
status: 'PUBLICADO' });
            const updateCall = vi.mocked(mockNewsRepo.update).mock.calls[0][1];
            expect(updateCall.publishedAt).toBeInstanceOf(Date);
        });

        it('não sobrescreve publishedAt se notícia já tinha data de publicação', async () => {
            const existingDate = new Date('2025-01-01T10:00:00Z');
            vi.mocked(mockNewsRepo.findById).mockResolvedValue({
                id: validInput.newsId,
                publishedAt: existingDate,
            } as any);
            vi.mocked(mockNewsRepo.update).mockResolvedValue({ id: validInput.newsId } as any);
            const uc = new UpdateNewsUseCase(mockNewsRepo);
            await uc.execute({ ...validInput,
status: 'PUBLICADO' });
            const updateCall = vi.mocked(mockNewsRepo.update).mock.calls[0][1];
            expect(updateCall.publishedAt).toBeUndefined();
        });

        it('remove publishedAt ao passar publishedAt: null explicitamente', async () => {
            vi.mocked(mockNewsRepo.findById).mockResolvedValue({
                id: validInput.newsId,
                publishedAt: new Date(),
            } as any);
            vi.mocked(mockNewsRepo.update).mockResolvedValue({ id: validInput.newsId } as any);
            const uc = new UpdateNewsUseCase(mockNewsRepo);
            await uc.execute({ ...validInput,
publishedAt: null });
            const updateCall = vi.mocked(mockNewsRepo.update).mock.calls[0][1];
            expect(updateCall.publishedAt).toBeNull();
        });
    });

    describe('atualização bem-sucedida', () => {
        it('retorna success true ao atualizar notícia válida', async () => {
            vi.mocked(mockNewsRepo.findById).mockResolvedValue({
                id: validInput.newsId,
                publishedAt: null,
            } as any);
            vi.mocked(mockNewsRepo.update).mockResolvedValue({ id: validInput.newsId } as any);
            const uc = new UpdateNewsUseCase(mockNewsRepo);
            const result = await uc.execute(validInput);
            expect(result.error).toBeUndefined();
        });

        it('falha se repositório retornar null na atualização', async () => {
            vi.mocked(mockNewsRepo.findById).mockResolvedValue({
                id: validInput.newsId,
                publishedAt: null,
            } as any);
            vi.mocked(mockNewsRepo.update).mockResolvedValue(null);
            const uc = new UpdateNewsUseCase(mockNewsRepo);
            const result = await uc.execute(validInput);
            expect(result.error).toBeDefined();
            expect(result.error?.message).toBe('Failed to update news');
        });
    });
});
