import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdateNewsUseCase } from '../update-news.js';
import type { NewsRepository } from '../../ports/external/news-repository.js';
import type { UserAdminRepository } from '../../ports/external/user-admin-repository.js';
import type { RuleRepository } from '../../ports/external/rule-repository.js';

vi.mock('../../lib/verify-permission.js', () => ({
    verifyPermission: vi.fn(),
}));

import { verifyPermission } from '../../lib/verify-permission.js';

const mockNewsRepo = {
    create: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    updateBanner: vi.fn(),
} as unknown as NewsRepository;

const mockUserAdminRepo = {} as unknown as UserAdminRepository;
const mockRuleRepo = {} as unknown as RuleRepository;

const validInput = {
    newsId: '123e4567-e89b-12d3-a456-426614174000',
    token: 'valid-token',
    title: 'Novo Título',
};

describe('UpdateNewsUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('validação de input', () => {
        it('falha se newsId não for UUID válido', async () => {
            const uc = new UpdateNewsUseCase(mockNewsRepo, mockUserAdminRepo, mockRuleRepo);
            const result = await uc.execute({ ...validInput, newsId: 'nao-e-uuid' });
            expect(result.success).toBe(false);
        });
    });

    describe('autenticação e permissão', () => {
        it('falha se sem permissão UPDATE_NEWS', async () => {
            vi.mocked(verifyPermission).mockResolvedValue({ authorized: false, statusCode: 403, error: 'Permission denied' });
            const uc = new UpdateNewsUseCase(mockNewsRepo, mockUserAdminRepo, mockRuleRepo);
            const result = await uc.execute(validInput);
            expect(result.success).toBe(false);
            expect(result.statusCode).toBe(403);
        });
    });

    describe('verificação da notícia', () => {
        beforeEach(() => {
            vi.mocked(verifyPermission).mockResolvedValue({ authorized: true, statusCode: 200 });
        });

        it('falha se notícia não existir', async () => {
            vi.mocked(mockNewsRepo.findById).mockResolvedValue(null);
            const uc = new UpdateNewsUseCase(mockNewsRepo, mockUserAdminRepo, mockRuleRepo);
            const result = await uc.execute(validInput);
            expect(result.success).toBe(false);
            expect(result.error?.message).toBe('News not found');
        });
    });

    describe('regra de publishedAt automático', () => {
        beforeEach(() => {
            vi.mocked(verifyPermission).mockResolvedValue({ authorized: true, statusCode: 200 });
        });

        it('define publishedAt ao publicar notícia que ainda não tinha data', async () => {
            vi.mocked(mockNewsRepo.findById).mockResolvedValue({ id: validInput.newsId, publishedAt: null } as any);
            vi.mocked(mockNewsRepo.update).mockResolvedValue({ id: validInput.newsId } as any);
            const uc = new UpdateNewsUseCase(mockNewsRepo, mockUserAdminRepo, mockRuleRepo);
            await uc.execute({ ...validInput, status: 'PUBLICADO' });
            const updateCall = vi.mocked(mockNewsRepo.update).mock.calls[0][1];
            expect(updateCall.publishedAt).toBeInstanceOf(Date);
        });

        it('não sobrescreve publishedAt se notícia já tinha data de publicação', async () => {
            const existingDate = new Date('2025-01-01T10:00:00Z');
            vi.mocked(mockNewsRepo.findById).mockResolvedValue({ id: validInput.newsId, publishedAt: existingDate } as any);
            vi.mocked(mockNewsRepo.update).mockResolvedValue({ id: validInput.newsId } as any);
            const uc = new UpdateNewsUseCase(mockNewsRepo, mockUserAdminRepo, mockRuleRepo);
            await uc.execute({ ...validInput, status: 'PUBLICADO' });
            const updateCall = vi.mocked(mockNewsRepo.update).mock.calls[0][1];
            expect(updateCall.publishedAt).toBeUndefined();
        });

        it('remove publishedAt ao passar publishedAt: null explicitamente', async () => {
            vi.mocked(mockNewsRepo.findById).mockResolvedValue({ id: validInput.newsId, publishedAt: new Date() } as any);
            vi.mocked(mockNewsRepo.update).mockResolvedValue({ id: validInput.newsId } as any);
            const uc = new UpdateNewsUseCase(mockNewsRepo, mockUserAdminRepo, mockRuleRepo);
            await uc.execute({ ...validInput, publishedAt: null });
            const updateCall = vi.mocked(mockNewsRepo.update).mock.calls[0][1];
            expect(updateCall.publishedAt).toBeNull();
        });
    });

    describe('atualização bem-sucedida', () => {
        it('retorna success true ao atualizar notícia válida', async () => {
            vi.mocked(verifyPermission).mockResolvedValue({ authorized: true, statusCode: 200 });
            vi.mocked(mockNewsRepo.findById).mockResolvedValue({ id: validInput.newsId, publishedAt: null } as any);
            vi.mocked(mockNewsRepo.update).mockResolvedValue({ id: validInput.newsId } as any);
            const uc = new UpdateNewsUseCase(mockNewsRepo, mockUserAdminRepo, mockRuleRepo);
            const result = await uc.execute(validInput);
            expect(result.success).toBe(true);
        });

        it('falha se repositório retornar null na atualização', async () => {
            vi.mocked(verifyPermission).mockResolvedValue({ authorized: true, statusCode: 200 });
            vi.mocked(mockNewsRepo.findById).mockResolvedValue({ id: validInput.newsId, publishedAt: null } as any);
            vi.mocked(mockNewsRepo.update).mockResolvedValue(null);
            const uc = new UpdateNewsUseCase(mockNewsRepo, mockUserAdminRepo, mockRuleRepo);
            const result = await uc.execute(validInput);
            expect(result.success).toBe(false);
            expect(result.error?.message).toBe('Failed to update news');
        });
    });
});
