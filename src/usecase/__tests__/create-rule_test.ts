import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateRuleUseCase } from '../create-rule.js';
import type { RuleRepository } from '../../ports/external/rule-repository.js';

const mockRuleRepo = {
    create: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    update: vi.fn(),
} as unknown as RuleRepository;

const validInput = {
    name: 'EDITOR',
    permitions: ['CREATE_COURSE', 'UPDATE_COURSE'] as any[],
};

describe('CreateRuleUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('validação de input', () => {
        it('falha se nome estiver vazio', async () => {
            const uc = new CreateRuleUseCase(mockRuleRepo);
            const result = await uc.execute({ ...validInput,
name: '' });
            expect(result.error).toBeDefined();
            expect(result.error?.message).toContain('Rule name is required');
        });

        it('falha se array de permissões estiver vazio', async () => {
            const uc = new CreateRuleUseCase(mockRuleRepo);
            const result = await uc.execute({ ...validInput,
permitions: [] });
            expect(result.error).toBeDefined();
            expect(result.error?.message).toContain('At least one permission is required');
        });

        it('falha se permissão inválida for passada', async () => {
            const uc = new CreateRuleUseCase(mockRuleRepo);
            const result = await uc.execute({
                ...validInput,
                permitions: ['PERMISSAO_INVALIDA'] as any,
            });
            expect(result.error).toBeDefined();
            expect(result.error).toBeDefined();
        });
    });

    describe('criação bem-sucedida', () => {
        it('retorna rule com id ao criar com dados válidos', async () => {
            const fakeRule = {
                id: 'rule-001',
                name: 'EDITOR',
                permitions: ['CREATE_COURSE'],
                description: '',
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            vi.mocked(mockRuleRepo.create).mockResolvedValue(fakeRule as any);
            const uc = new CreateRuleUseCase(mockRuleRepo);
            const result = await uc.execute(validInput);
            expect(result.error).toBeUndefined();
            expect(result.rule?.id).toBe('rule-001');
        });

        it('description é opcional — aceita criação sem ela', async () => {
            const fakeRule = {
                id: 'rule-002',
                name: 'LEITOR',
                permitions: ['READ_COURSE'],
                description: '',
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            vi.mocked(mockRuleRepo.create).mockResolvedValue(fakeRule as any);
            const uc = new CreateRuleUseCase(mockRuleRepo);
            const result = await uc.execute({ name: 'LEITOR',
permitions: ['READ_COURSE'] as any });
            expect(result.error).toBeUndefined();
        });
    });
});
