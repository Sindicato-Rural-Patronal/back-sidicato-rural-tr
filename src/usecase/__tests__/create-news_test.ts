import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateNewsUseCase } from '../create-news.js';
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
    title: 'Assembleia Geral',
    content: 'Conteúdo da notícia...',
};

describe('CreateNewsUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('autenticação e permissão', () => {
        it('falha se sem permissão CREATE_NEWS', async () => {
            vi.mocked(verifyPermission).mockResolvedValue({ authorized: false, statusCode: 403, error: 'Permission denied' });
            const uc = new CreateNewsUseCase(mockNewsRepo, mockUserAdminRepo, mockRuleRepo);
            const result = await uc.execute(validInput, 'bad-token');
            expect(result.success).toBe(false);
            expect(result.statusCode).toBe(403);
        });
    });

    describe('validação de input', () => {
        beforeEach(() => {
            vi.mocked(verifyPermission).mockResolvedValue({ authorized: true, statusCode: 200 });
        });

        it('falha se título estiver vazio', async () => {
            const uc = new CreateNewsUseCase(mockNewsRepo, mockUserAdminRepo, mockRuleRepo);
            const result = await uc.execute({ ...validInput, title: '' }, 'valid-token');
            expect(result.success).toBe(false);
            expect(result.error?.message).toContain('Title is required');
        });

        it('falha se conteúdo estiver vazio', async () => {
            const uc = new CreateNewsUseCase(mockNewsRepo, mockUserAdminRepo, mockRuleRepo);
            const result = await uc.execute({ ...validInput, content: '' }, 'valid-token');
            expect(result.success).toBe(false);
            expect(result.error?.message).toContain('Content is required');
        });
    });

    describe('regra de publishedAt automático', () => {
        beforeEach(() => {
            vi.mocked(verifyPermission).mockResolvedValue({ authorized: true, statusCode: 200 });
        });

        it('define publishedAt automaticamente quando status é PUBLICADO sem data explícita', async () => {
            vi.mocked(mockNewsRepo.create).mockResolvedValue({ id: 'news-001' } as any);
            const uc = new CreateNewsUseCase(mockNewsRepo, mockUserAdminRepo, mockRuleRepo);
            await uc.execute({ ...validInput, status: 'PUBLICADO' }, 'valid-token');
            const createCall = vi.mocked(mockNewsRepo.create).mock.calls[0][0];
            expect(createCall.publishedAt).toBeInstanceOf(Date);
        });

        it('não define publishedAt quando status é NAO_PUBLICADO', async () => {
            vi.mocked(mockNewsRepo.create).mockResolvedValue({ id: 'news-002' } as any);
            const uc = new CreateNewsUseCase(mockNewsRepo, mockUserAdminRepo, mockRuleRepo);
            await uc.execute({ ...validInput, status: 'NAO_PUBLICADO' }, 'valid-token');
            const createCall = vi.mocked(mockNewsRepo.create).mock.calls[0][0];
            expect(createCall.publishedAt).toBeUndefined();
        });

        it('respeita publishedAt explícita se fornecida', async () => {
            vi.mocked(mockNewsRepo.create).mockResolvedValue({ id: 'news-003' } as any);
            const uc = new CreateNewsUseCase(mockNewsRepo, mockUserAdminRepo, mockRuleRepo);
            await uc.execute({ ...validInput, status: 'PUBLICADO', publishedAt: '2026-01-01T10:00:00.000Z' }, 'valid-token');
            const createCall = vi.mocked(mockNewsRepo.create).mock.calls[0][0];
            expect(createCall.publishedAt?.toISOString()).toBe('2026-01-01T10:00:00.000Z');
        });

        it('status padrão é NAO_PUBLICADO quando não informado', async () => {
            vi.mocked(mockNewsRepo.create).mockResolvedValue({ id: 'news-004' } as any);
            const uc = new CreateNewsUseCase(mockNewsRepo, mockUserAdminRepo, mockRuleRepo);
            await uc.execute(validInput, 'valid-token');
            const createCall = vi.mocked(mockNewsRepo.create).mock.calls[0][0];
            expect(createCall.status).toBe('NAO_PUBLICADO');
        });
    });

    describe('criação bem-sucedida', () => {
        it('retorna newsId ao criar notícia válida', async () => {
            vi.mocked(verifyPermission).mockResolvedValue({ authorized: true, statusCode: 200 });
            vi.mocked(mockNewsRepo.create).mockResolvedValue({ id: 'news-abc' } as any);
            const uc = new CreateNewsUseCase(mockNewsRepo, mockUserAdminRepo, mockRuleRepo);
            const result = await uc.execute(validInput, 'valid-token');
            expect(result.success).toBe(true);
            expect(result.newsId).toBe('news-abc');
        });
    });
});
