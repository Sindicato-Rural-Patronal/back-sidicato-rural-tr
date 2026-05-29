import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeleteNewsUseCase } from '../delete-news.js';
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

describe('DeleteNewsUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('autenticação e permissão', () => {
        it('falha se sem permissão DELETE_NEWS', async () => {
            vi.mocked(verifyPermission).mockResolvedValue({ authorized: false, statusCode: 403, error: 'Permission denied' });
            const uc = new DeleteNewsUseCase(mockNewsRepo, mockUserAdminRepo, mockRuleRepo);
            const result = await uc.execute('news-001', 'bad-token');
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
            const uc = new DeleteNewsUseCase(mockNewsRepo, mockUserAdminRepo, mockRuleRepo);
            const result = await uc.execute('news-inexistente', 'valid-token');
            expect(result.success).toBe(false);
            expect(result.error?.message).toBe('News not found');
        });

        it('falha se deleção retornar false', async () => {
            vi.mocked(mockNewsRepo.findById).mockResolvedValue({ id: 'news-001' } as any);
            vi.mocked(mockNewsRepo.delete).mockResolvedValue(false);
            const uc = new DeleteNewsUseCase(mockNewsRepo, mockUserAdminRepo, mockRuleRepo);
            const result = await uc.execute('news-001', 'valid-token');
            expect(result.success).toBe(false);
            expect(result.error?.message).toBe('Failed to delete news');
        });
    });

    describe('deleção bem-sucedida', () => {
        it('retorna success true ao deletar notícia válida', async () => {
            vi.mocked(verifyPermission).mockResolvedValue({ authorized: true, statusCode: 200 });
            vi.mocked(mockNewsRepo.findById).mockResolvedValue({ id: 'news-001' } as any);
            vi.mocked(mockNewsRepo.delete).mockResolvedValue(true);
            const uc = new DeleteNewsUseCase(mockNewsRepo, mockUserAdminRepo, mockRuleRepo);
            const result = await uc.execute('news-001', 'valid-token');
            expect(result.success).toBe(true);
        });
    });
});
