import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListUsersUseCase } from '../list-users.js';
import type { UserDataRepository } from '../../ports/external/user-data-repository.js';

const mockUserDataRepo = {
    create: vi.fn(),
    findById: vi.fn(),
    findByCpf: vi.fn(),
    findByRg: vi.fn(),
    findByEmailOrCpf: vi.fn(),
    findAll: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
} as unknown as UserDataRepository;

describe('ListUsersUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('listagem de usuários', () => {
        it('retorna todos os usuários', async () => {
            const fakeUsers = [
                { id: 'u1',
name: 'João' },
                { id: 'u2',
name: 'Maria' },
            ];
            vi.mocked(mockUserDataRepo.findAll).mockResolvedValue(fakeUsers as any);
            const uc = new ListUsersUseCase(mockUserDataRepo);
            const result = await uc.execute();
            expect(result.error).toBeUndefined();
            expect(result.result?.data).toHaveLength(2);
        });
    });
});
