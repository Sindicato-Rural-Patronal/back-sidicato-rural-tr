import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListRoomsUseCase } from '../list-rooms.js';
import type { RoomRepository } from '../../ports/external/room-repository.js';

const mockRoomRepo = {
    create: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    delete: vi.fn(),
} as unknown as RoomRepository;

describe('ListRoomsUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('listagem de salas', () => {
        it('retorna todas as salas disponíveis', async () => {
            const fakeRooms = [{ id: 'r1', name: 'Sala A' }, { id: 'r2', name: 'Sala B' }];
            vi.mocked(mockRoomRepo.findAll).mockResolvedValue(fakeRooms as any);
            const uc = new ListRoomsUseCase(mockRoomRepo);
            const result = await uc.execute();
            expect(result.success).toBe(true);
            expect(result.rooms).toHaveLength(2);
        });

        it('retorna lista vazia quando não há salas', async () => {
            vi.mocked(mockRoomRepo.findAll).mockResolvedValue([]);
            const uc = new ListRoomsUseCase(mockRoomRepo);
            const result = await uc.execute();
            expect(result.rooms).toHaveLength(0);
        });
    });
});
