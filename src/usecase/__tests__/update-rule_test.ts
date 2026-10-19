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
    permissions: ['READ_COURSE'] as any[],
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
                permissions: ['PERMISSAO_INVALIDA'] as any,
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
            vi.mocked(mockRuleRepo.findById).mockResolvedValue({ id: 'rule-001',
permissions: ['READ_COURSE'] } as any);
            vi.mocked(mockRuleRepo.update).mockResolvedValue({
                id: 'rule-001',
                name: 'NOVO_NOME',
            } as any);
            const uc = new UpdateRuleUseCase(mockRuleRepo);
            const result = await uc.execute(validInput, ['READ_COURSE']);
            expect(result.error).toBeUndefined();
            expect(result.rule).toBeDefined();
        });

        it('bloqueia conceder permissão além das do ator (anti-escalonamento)', async () => {
            vi.mocked(mockRuleRepo.findById).mockResolvedValue({ id: 'rule-001',
permissions: ['READ_COURSE'] } as any);
            const uc = new UpdateRuleUseCase(mockRuleRepo);
            const result = await uc.execute(
                { ...validInput,
permissions: ['DELETE_USER_ADMIN'] as any },
                ['READ_COURSE'],
            );
            expect(result.error).toBeDefined();
            expect(result.error?.name).toBe('ForbiddenError');
            expect(mockRuleRepo.update).not.toHaveBeenCalled();
        });

        // Antes só as permissões ENVIADAS eram conferidas: quem tinha UPDATE_RULE
        // esvaziava a SUPER_RULE e todos os super admins perdiam o acesso.
        it('bloqueia mexer em regra mais forte que a do ator, mesmo tirando permissões', async () => {
            vi.mocked(mockRuleRepo.findById).mockResolvedValue({
                id: 'super',
                permissions: ['READ_COURSE', 'UPDATE_RULE', 'DELETE_USER_ADMIN'],
            } as any);
            const uc = new UpdateRuleUseCase(mockRuleRepo);
            const result = await uc.execute(
                { ruleId: 'super',
permissions: ['READ_COURSE'] as any },
                ['READ_COURSE', 'UPDATE_RULE'],
            );
            expect(result.error?.name).toBe('ForbiddenError');
            expect(result.error?.message).toBe('Você não pode alterar uma regra com permissões além das suas.');
            expect(mockRuleRepo.update).not.toHaveBeenCalled();
        });

        it('bloqueia até renomear uma regra mais forte', async () => {
            vi.mocked(mockRuleRepo.findById).mockResolvedValue({ id: 'super',
permissions: ['DELETE_USER_ADMIN'] } as any);
            const result = await new UpdateRuleUseCase(mockRuleRepo).execute({ ruleId: 'super',
name: 'OUTRO' }, ['UPDATE_RULE']);
            expect(result.error?.name).toBe('ForbiddenError');
            expect(mockRuleRepo.update).not.toHaveBeenCalled();
        });

        it('deixa mexer na própria regra ou numa contida nas permissões do ator', async () => {
            vi.mocked(mockRuleRepo.findById).mockResolvedValue({ id: 'r',
permissions: ['READ_COURSE', 'UPDATE_RULE'] } as any);
            vi.mocked(mockRuleRepo.update).mockResolvedValue({ id: 'r' } as any);
            const result = await new UpdateRuleUseCase(mockRuleRepo).execute(
                { ruleId: 'r',
permissions: ['READ_COURSE'] as any },
                ['READ_COURSE', 'UPDATE_RULE'],
            );
            expect(result.error).toBeUndefined();
            expect(mockRuleRepo.update).toHaveBeenCalled();
        });
    });
});
