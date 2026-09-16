import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateRoomUseCase } from '../create-room.js';
import { UpdateRoomUseCase } from '../update-room.js';
import type { RoomRepository } from '../../ports/external/room-repository.js';
import { RoomNameAlreadyExistsError } from '../../errors/conflict.js';

const mockRoomRepo = {
    create: vi.fn(),
    findById: vi.fn(),
    findByName: vi.fn(),
    findAll: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
} as unknown as RoomRepository;

const validInput = {
    name: 'SALA 1',
    description: 'Sala principal',
    maxCapacity: 30,
};

describe('CreateRoomUseCase', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(mockRoomRepo.findByName).mockResolvedValue(null);
    });

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

        it('recusa nome fora da lista de salas', async () => {
            const uc = new CreateRoomUseCase(mockRoomRepo);
            const result = await uc.execute({ ...validInput,
name: 'Laboratório 01' });
            expect(result.error?.message).toContain('Escolha uma sala da lista');
            expect(mockRoomRepo.create).not.toHaveBeenCalled();
        });

        it('recusa sala já cadastrada', async () => {
            vi.mocked(mockRoomRepo.findByName).mockResolvedValue({ id: 'r-1' } as any);
            const uc = new CreateRoomUseCase(mockRoomRepo);
            const result = await uc.execute(validInput);
            expect(result.error).toBeInstanceOf(RoomNameAlreadyExistsError);
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

        it('normaliza o nome (acento, caixa e espaços)', async () => {
            vi.mocked(mockRoomRepo.create).mockResolvedValue({ id: 'room-002' } as any);
            const uc = new CreateRoomUseCase(mockRoomRepo);
            await uc.execute({ ...validInput,
name: '  Auditório ' });
            expect(mockRoomRepo.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'AUDITORIO' }));
        });
    });
});

describe('UpdateRoomUseCase', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(mockRoomRepo.findByName).mockResolvedValue(null);
    });

    it('mantém nome antigo fora da lista ao editar só a capacidade', async () => {
        vi.mocked(mockRoomRepo.findById).mockResolvedValue({ id: 'r-1',
name: 'SALA ANTIGA' } as any);
        const uc = new UpdateRoomUseCase(mockRoomRepo);
        const result = await uc.execute('r-1', { name: 'SALA ANTIGA',
description: 'x',
maxCapacity: 5 });
        expect(result.error).toBeUndefined();
        expect(mockRoomRepo.update).toHaveBeenCalled();
    });

    it('recusa trocar para nome fora da lista', async () => {
        vi.mocked(mockRoomRepo.findById).mockResolvedValue({ id: 'r-1',
name: 'SALA 1' } as any);
        const uc = new UpdateRoomUseCase(mockRoomRepo);
        const result = await uc.execute('r-1', { name: 'SALA 9',
description: 'x',
maxCapacity: 5 });
        expect(result.error?.message).toContain('Escolha uma sala da lista');
    });

    it('recusa trocar para uma sala que já existe', async () => {
        vi.mocked(mockRoomRepo.findById).mockResolvedValue({ id: 'r-1',
name: 'SALA 1' } as any);
        vi.mocked(mockRoomRepo.findByName).mockResolvedValue({ id: 'r-2',
name: 'SALA 2' } as any);
        const uc = new UpdateRoomUseCase(mockRoomRepo);
        const result = await uc.execute('r-1', { name: 'SALA 2',
description: 'x',
maxCapacity: 5 });
        expect(result.error).toBeInstanceOf(RoomNameAlreadyExistsError);
    });
});
