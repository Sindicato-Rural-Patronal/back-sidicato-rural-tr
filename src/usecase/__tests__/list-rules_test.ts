import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListRulesUseCase } from '../list-rules.js';
import type { RuleRepository } from '../../ports/external/rule-repository.js';
import type { UserAdminRepository } from '../../ports/external/user-admin-repository.js';

vi.mock('../../lib/verify-permission.js', () => ({
    verifyPermission: vi.fn(),
}));

import { verifyPermission } from '../../lib/verify-permission.js';

const mockRuleRepo = {
    create: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
    update: vi.fn(),
} as unknown as RuleRepository;

const mockUserAdminRepo = {} as unknown as UserAdminRepository;

describe('ListRulesUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('autenticação e permissão', () => {
        it('falha se sem permissão READ_RULE', async () => {
            vi.mocked(verifyPermission).mockResolvedValue({ authorized: false, statusCode: 403, error: 'Permission denied' });
            const uc = new ListRulesUseCase(mockRuleRepo, mockUserAdminRepo);
            const result = await uc.execute('bad-token');
            expect(result.success).toBe(false);
            expect(result.statusCode).toBe(403);
        });
    });

    describe('listagem de regras', () => {
        it('retorna todas as regras de permissão', async () => {
            vi.mocked(verifyPermission).mockResolvedValue({ authorized: true, statusCode: 200 });
            const fakeRules = [{ id: 'r1', name: 'SUPER_RULE' }, { id: 'r2', name: 'EDITOR' }];
            vi.mocked(mockRuleRepo.findAll).mockResolvedValue(fakeRules as any);
            const uc = new ListRulesUseCase(mockRuleRepo, mockUserAdminRepo);
            const result = await uc.execute('valid-token');
            expect(result.success).toBe(true);
            expect(result.result?.data).toHaveLength(2);
        });
    });
});
