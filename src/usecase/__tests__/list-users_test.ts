import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListUsersUseCase } from '../list-users.js';
import type { UserDataRepository } from '../../ports/external/user-data-repository.js';
import type { UserAdminRepository } from '../../ports/external/user-admin-repository.js';
import type { RuleRepository } from '../../ports/external/rule-repository.js';

vi.mock('../../lib/verify-permission.js', () => ({
    verifyPermission: vi.fn(),
}));

import { verifyPermission } from '../../lib/verify-permission.js';

const mockUserDataRepo = {
    create: vi.fn(),
    findById: vi.fn(),
    findByEmailOurPhone: vi.fn(),
    findByEmailOrCpf: vi.fn(),
    findAll: vi.fn(),
} as unknown as UserDataRepository;

const mockUserAdminRepo = {} as unknown as UserAdminRepository;
const mockRuleRepo = {} as unknown as RuleRepository;

describe('ListUsersUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('autenticação e permissão', () => {
        it('falha se sem permissão READ_USER', async () => {
            vi.mocked(verifyPermission).mockResolvedValue({ authorized: false, statusCode: 403, error: 'Permission denied' });
            const uc = new ListUsersUseCase(mockUserDataRepo, mockUserAdminRepo, mockRuleRepo);
            const result = await uc.execute('bad-token');
            expect(result.success).toBe(false);
            expect(result.statusCode).toBe(403);
        });
    });

    describe('listagem de usuários', () => {
        it('retorna todos os usuários', async () => {
            vi.mocked(verifyPermission).mockResolvedValue({ authorized: true, statusCode: 200 });
            const fakeUsers = [{ id: 'u1', name: 'João' }, { id: 'u2', name: 'Maria' }];
            vi.mocked(mockUserDataRepo.findAll).mockResolvedValue(fakeUsers as any);
            const uc = new ListUsersUseCase(mockUserDataRepo, mockUserAdminRepo, mockRuleRepo);
            const result = await uc.execute('valid-token');
            expect(result.success).toBe(true);
            expect(result.users).toHaveLength(2);
        });
    });
});
