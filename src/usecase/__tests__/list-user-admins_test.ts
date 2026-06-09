import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListUserAdminsUseCase } from '../list-user-admins.js';
import type { UserAdminRepository } from '../../ports/external/user-admin-repository.js';
import type { RuleRepository } from '../../ports/external/rule-repository.js';

vi.mock('../../lib/verify-permission.js', () => ({
    verifyPermission: vi.fn(),
}));

import { verifyPermission } from '../../lib/verify-permission.js';

const mockUserAdminRepo = {
    create: vi.fn(),
    findById: vi.fn(),
    findByUsername: vi.fn(),
    findByUserDataId: vi.fn(),
    findAll: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
} as unknown as UserAdminRepository;

const mockRuleRepo = {} as unknown as RuleRepository;

describe('ListUserAdminsUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('autenticação e permissão', () => {
        it('falha se sem permissão READ_USER_ADMIN', async () => {
            vi.mocked(verifyPermission).mockResolvedValue({ authorized: false, statusCode: 403, error: 'Permission denied' });
            const uc = new ListUserAdminsUseCase(mockUserAdminRepo, mockRuleRepo);
            const result = await uc.execute('bad-token');
            expect(result.success).toBe(false);
            expect(result.statusCode).toBe(403);
        });
    });

    describe('listagem de admins', () => {
        it('retorna lista de admins com detalhes', async () => {
            vi.mocked(verifyPermission).mockResolvedValue({ authorized: true, statusCode: 200 });
            const fakeAdmins = [{ id: 'a1', username: 'admin1' }, { id: 'a2', username: 'admin2' }];
            vi.mocked(mockUserAdminRepo.findAll).mockResolvedValue(fakeAdmins as any);
            const uc = new ListUserAdminsUseCase(mockUserAdminRepo, mockRuleRepo);
            const result = await uc.execute('valid-token');
            expect(result.success).toBe(true);
            expect(result.result?.data).toHaveLength(2);
        });
    });
});
