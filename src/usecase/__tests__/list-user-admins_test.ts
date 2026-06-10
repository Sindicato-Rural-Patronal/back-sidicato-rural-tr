import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListUserAdminsUseCase } from '../list-user-admins.js';
import type { UserAdminRepository } from '../../ports/external/user-admin-repository.js';

const mockUserAdminRepo = {
    create: vi.fn(),
    findById: vi.fn(),
    findByUsername: vi.fn(),
    findByUserDataId: vi.fn(),
    findAll: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
} as unknown as UserAdminRepository;

describe('ListUserAdminsUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('listagem de admins', () => {
        it('retorna lista de admins com detalhes', async () => {
            const fakeAdmins = [
                { id: 'a1',
username: 'admin1' },
                { id: 'a2',
username: 'admin2' },
            ];
            vi.mocked(mockUserAdminRepo.findAll).mockResolvedValue(fakeAdmins as any);
            const uc = new ListUserAdminsUseCase(mockUserAdminRepo);
            const result = await uc.execute();
            expect(result.error).toBeUndefined();
            expect(result.result?.data).toHaveLength(2);
        });
    });
});
