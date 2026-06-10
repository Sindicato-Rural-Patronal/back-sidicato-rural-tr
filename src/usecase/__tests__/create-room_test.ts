import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateRoomUseCase } from '../create-room.js';
import type { RoomRepository } from '../../ports/external/room-repository.js';

const mockRoomRepo = {
    create: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    delete: vi.fn(),
} as unknown as RoomRepository;

const validInput = {
    name: 'Sala A',
    description: 'Sala principal',
    maxCapacity: 30,
};

describe('CreateRoomUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('validação de input', () => {
        it('falha se nome estiver vazio', async () => {
            const uc = new CreateRoomUseCase(mockRoomRepo);
            const result = await uc.execute({ ...validInput,
name: '' });
            expect(result.error).toBeDefined();
            expect(result.error?.message).toContain('Room name is required');
        });

        it('falha se descrição estiver vazia', async () => {
            const uc = new CreateRoomUseCase(mockRoomRepo);
            const result = await uc.execute({ ...validInput,
description: '' });
            expect(result.error).toBeDefined();
            expect(result.error?.message).toContain('Room description is required');
        });

        it('falha se capacidade máxima for zero', async () => {
            const uc = new CreateRoomUseCase(mockRoomRepo);
            const result = await uc.execute({ ...validInput,
maxCapacity: 0 });
            expect(result.error).toBeDefined();
            expect(result.error?.message).toContain('Max capacity must be a positive integer');
        });

        it('falha se capacidade máxima for negativa', async () => {
            const uc = new CreateRoomUseCase(mockRoomRepo);
            const result = await uc.execute({ ...validInput,
maxCapacity: -5 });
            expect(result.error).toBeDefined();
        });
    });

    describe('criação bem-sucedida', () => {
        it('retorna roomId ao criar sala válida', async () => {
            vi.mocked(mockRoomRepo.create).mockResolvedValue({ id: 'room-001' } as any);
            const uc = new CreateRoomUseCase(mockRoomRepo);
            const result = await uc.execute(validInput);
            expect(result.error).toBeUndefined();
            expect(result.roomId).toBe('room-001');
        });
    });
});
