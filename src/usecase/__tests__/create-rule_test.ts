import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateRuleUseCase } from '../create-rule.js';
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
    name: 'EDITOR',
    permitions: ['CREATE_COURSE', 'UPDATE_COURSE'] as any[],
    token: 'valid-token',
};

describe('CreateRuleUseCase', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(verifyPermission).mockResolvedValue({ authorized: true, statusCode: 200 });
    });

    describe('permissão', () => {
        it('falha se sem permissão CREATE_RULE', async () => {
            vi.mocked(verifyPermission).mockResolvedValue({ authorized: false, statusCode: 403, error: 'Permission denied' });
            const uc = new CreateRuleUseCase(mockRuleRepo, mockUserAdminRepo);
            const result = await uc.execute(validInput);
            expect(result.success).toBe(false);
            expect(result.statusCode).toBe(403);
        });
    });

    describe('validação de input', () => {
        it('falha se nome estiver vazio', async () => {
            const uc = new CreateRuleUseCase(mockRuleRepo, mockUserAdminRepo);
            const result = await uc.execute({ ...validInput, name: '' });
            expect(result.success).toBe(false);
            expect(result.error?.message).toContain('Rule name is required');
        });

        it('falha se array de permissões estiver vazio', async () => {
            const uc = new CreateRuleUseCase(mockRuleRepo, mockUserAdminRepo);
            const result = await uc.execute({ ...validInput, permitions: [] });
            expect(result.success).toBe(false);
            expect(result.error?.message).toContain('At least one permission is required');
        });

        it('falha se permissão inválida for passada', async () => {
            const uc = new CreateRuleUseCase(mockRuleRepo, mockUserAdminRepo);
            const result = await uc.execute({ ...validInput, permitions: ['PERMISSAO_INVALIDA'] as any });
            expect(result.success).toBe(false);
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
            const uc = new CreateRuleUseCase(mockRuleRepo, mockUserAdminRepo);
            const result = await uc.execute(validInput);
            expect(result.success).toBe(true);
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
            const uc = new CreateRuleUseCase(mockRuleRepo, mockUserAdminRepo);
            const result = await uc.execute({ name: 'LEITOR', permitions: ['READ_COURSE'] as any, token: 'valid-token' });
            expect(result.success).toBe(true);
        });
    });
});
