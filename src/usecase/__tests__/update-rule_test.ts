import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdateRuleUseCase } from '../update-rule.js';
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
    update: vi.fn(),
} as unknown as RuleRepository;

const mockUserAdminRepo = {} as unknown as UserAdminRepository;

const validInput = {
    ruleId: 'rule-001',
    token: 'valid-token',
    name: 'NOVO_NOME',
    permitions: ['READ_COURSE'] as any[],
};

describe('UpdateRuleUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('validação de input', () => {
        it('falha se ruleId estiver vazio', async () => {
            vi.mocked(verifyPermission).mockResolvedValue({ authorized: true, statusCode: 200 });
            const uc = new UpdateRuleUseCase(mockRuleRepo, mockUserAdminRepo);
            const result = await uc.execute({ ...validInput, ruleId: '' });
            expect(result.success).toBe(false);
        });

        it('falha se token estiver vazio', async () => {
            const uc = new UpdateRuleUseCase(mockRuleRepo, mockUserAdminRepo);
            const result = await uc.execute({ ...validInput, token: '' });
            expect(result.success).toBe(false);
            expect(result.error?.message).toContain('Token is required');
        });

        it('falha se array de permissões for inválido', async () => {
            vi.mocked(verifyPermission).mockResolvedValue({ authorized: true, statusCode: 200 });
            const uc = new UpdateRuleUseCase(mockRuleRepo, mockUserAdminRepo);
            const result = await uc.execute({ ...validInput, permitions: ['PERMISSAO_INVALIDA'] as any });
            expect(result.success).toBe(false);
        });
    });

    describe('autenticação e permissão', () => {
        it('falha se sem permissão UPDATE_RULE', async () => {
            vi.mocked(verifyPermission).mockResolvedValue({ authorized: false, statusCode: 403, error: 'Permission denied' });
            const uc = new UpdateRuleUseCase(mockRuleRepo, mockUserAdminRepo);
            const result = await uc.execute(validInput);
            expect(result.success).toBe(false);
            expect(result.statusCode).toBe(403);
        });
    });

    describe('verificação da regra', () => {
        beforeEach(() => {
            vi.mocked(verifyPermission).mockResolvedValue({ authorized: true, statusCode: 200 });
        });

        it('falha se regra não existir', async () => {
            vi.mocked(mockRuleRepo.findById).mockResolvedValue(null);
            const uc = new UpdateRuleUseCase(mockRuleRepo, mockUserAdminRepo);
            const result = await uc.execute(validInput);
            expect(result.success).toBe(false);
            expect(result.error?.message).toBe('Rule not found');
        });
    });

    describe('atualização bem-sucedida', () => {
        it('retorna regra atualizada', async () => {
            vi.mocked(verifyPermission).mockResolvedValue({ authorized: true, statusCode: 200 });
            vi.mocked(mockRuleRepo.findById).mockResolvedValue({ id: 'rule-001' } as any);
            vi.mocked(mockRuleRepo.update).mockResolvedValue({ id: 'rule-001', name: 'NOVO_NOME' } as any);
            const uc = new UpdateRuleUseCase(mockRuleRepo, mockUserAdminRepo);
            const result = await uc.execute(validInput);
            expect(result.success).toBe(true);
            expect(result.rule).toBeDefined();
        });
    });
});
