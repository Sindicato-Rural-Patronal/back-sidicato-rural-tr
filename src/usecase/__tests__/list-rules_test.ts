import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListRulesUseCase } from '../list-rules.js';
import type { RuleRepository } from '../../ports/external/rule-repository.js';

const mockRuleRepo = {
    create: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
    update: vi.fn(),
} as unknown as RuleRepository;

describe('ListRulesUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('listagem de regras', () => {
        it('retorna todas as regras de permissão', async () => {
            const fakeRules = [
                { id: 'r1',
name: 'SUPER_RULE' },
                { id: 'r2',
name: 'EDITOR' },
            ];
            vi.mocked(mockRuleRepo.findAll).mockResolvedValue(fakeRules as any);
            const uc = new ListRulesUseCase(mockRuleRepo);
            const result = await uc.execute();
            expect(result.error).toBeUndefined();
            expect(result.result?.data).toHaveLength(2);
        });
    });
});
