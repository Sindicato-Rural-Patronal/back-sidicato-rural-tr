import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateRoomUseCase } from '../create-room.js';
import type { RoomRepository } from '../../ports/external/room-repository.js';
import type { UserAdminRepository } from '../../ports/external/user-admin-repository.js';
import type { RuleRepository } from '../../ports/external/rule-repository.js';

vi.mock('../../lib/verify-permission.js', () => ({
    verifyPermission: vi.fn(),
}));

import { verifyPermission } from '../../lib/verify-permission.js';

const mockRoomRepo = {
    create: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    delete: vi.fn(),
} as unknown as RoomRepository;

const mockUserAdminRepo = {} as unknown as UserAdminRepository;
const mockRuleRepo = {} as unknown as RuleRepository;

const validInput = {
    name: 'Sala A',
    description: 'Sala principal',
    maxCapacity: 30,
};

describe('CreateRoomUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('autenticação e permissão', () => {
        it('falha se sem permissão CREATE_COURSE', async () => {
            vi.mocked(verifyPermission).mockResolvedValue({ authorized: false, statusCode: 403, error: 'Permission denied' });
            const uc = new CreateRoomUseCase(mockRoomRepo, mockUserAdminRepo, mockRuleRepo);
            const result = await uc.execute(validInput, 'bad-token');
            expect(result.success).toBe(false);
            expect(result.statusCode).toBe(403);
        });
    });

    describe('validação de input', () => {
        beforeEach(() => {
            vi.mocked(verifyPermission).mockResolvedValue({ authorized: true, statusCode: 200 });
        });

        it('falha se nome estiver vazio', async () => {
            const uc = new CreateRoomUseCase(mockRoomRepo, mockUserAdminRepo, mockRuleRepo);
            const result = await uc.execute({ ...validInput, name: '' }, 'valid-token');
            expect(result.success).toBe(false);
            expect(result.error?.message).toContain('Room name is required');
        });

        it('falha se descrição estiver vazia', async () => {
            const uc = new CreateRoomUseCase(mockRoomRepo, mockUserAdminRepo, mockRuleRepo);
            const result = await uc.execute({ ...validInput, description: '' }, 'valid-token');
            expect(result.success).toBe(false);
            expect(result.error?.message).toContain('Room description is required');
        });

        it('falha se capacidade máxima for zero', async () => {
            const uc = new CreateRoomUseCase(mockRoomRepo, mockUserAdminRepo, mockRuleRepo);
            const result = await uc.execute({ ...validInput, maxCapacity: 0 }, 'valid-token');
            expect(result.success).toBe(false);
            expect(result.error?.message).toContain('Max capacity must be a positive integer');
        });

        it('falha se capacidade máxima for negativa', async () => {
            const uc = new CreateRoomUseCase(mockRoomRepo, mockUserAdminRepo, mockRuleRepo);
            const result = await uc.execute({ ...validInput, maxCapacity: -5 }, 'valid-token');
            expect(result.success).toBe(false);
        });
    });

    describe('criação bem-sucedida', () => {
        it('retorna roomId ao criar sala válida', async () => {
            vi.mocked(verifyPermission).mockResolvedValue({ authorized: true, statusCode: 200 });
            vi.mocked(mockRoomRepo.create).mockResolvedValue({ id: 'room-001' } as any);
            const uc = new CreateRoomUseCase(mockRoomRepo, mockUserAdminRepo, mockRuleRepo);
            const result = await uc.execute(validInput, 'valid-token');
            expect(result.success).toBe(true);
            expect(result.roomId).toBe('room-001');
        });
    });
});
