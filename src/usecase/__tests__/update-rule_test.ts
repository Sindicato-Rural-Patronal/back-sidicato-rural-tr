import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdateRuleUseCase } from '../update-rule.js';
import type { RuleRepository } from '../../ports/external/rule-repository.js';

const mockRuleRepo = {
    create: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    update: vi.fn(),
} as unknown as RuleRepository;

const validInput = {
    ruleId: 'rule-001',
    name: 'NOVO_NOME',
    permitions: ['READ_COURSE'] as any[],
};

describe('UpdateRuleUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('validação de input', () => {
        it('falha se ruleId estiver vazio', async () => {
            const uc = new UpdateRuleUseCase(mockRuleRepo);
            const result = await uc.execute({ ...validInput,
ruleId: '' });
            expect(result.error).toBeDefined();
        });

        it('falha se array de permissões for inválido', async () => {
            const uc = new UpdateRuleUseCase(mockRuleRepo);
            const result = await uc.execute({
                ...validInput,
                permitions: ['PERMISSAO_INVALIDA'] as any,
            });
            expect(result.error).toBeDefined();
        });
    });

    describe('verificação da regra', () => {
        it('falha se regra não existir', async () => {
            vi.mocked(mockRuleRepo.findById).mockResolvedValue(null);
            const uc = new UpdateRuleUseCase(mockRuleRepo);
            const result = await uc.execute(validInput);
            expect(result.error).toBeDefined();
            expect(result.error?.message).toBe('Rule not found');
        });
    });

    describe('atualização bem-sucedida', () => {
        it('retorna regra atualizada', async () => {
            vi.mocked(mockRuleRepo.findById).mockResolvedValue({ id: 'rule-001' } as any);
            vi.mocked(mockRuleRepo.update).mockResolvedValue({
                id: 'rule-001',
                name: 'NOVO_NOME',
            } as any);
            const uc = new UpdateRuleUseCase(mockRuleRepo);
            const result = await uc.execute(validInput);
            expect(result.error).toBeUndefined();
            expect(result.rule).toBeDefined();
        });
    });
});
