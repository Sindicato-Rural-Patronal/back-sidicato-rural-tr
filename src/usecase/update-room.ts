import { z } from 'zod';
import type { RoomRepository } from '../ports/external/room-repository.js';
import { ValidationError } from '../errors/validation.js';
import { RoomNotFoundError } from '../errors/not-found.js';
import { RoomNameAlreadyExistsError } from '../errors/conflict.js';
import { isRoomName, normalizeRoomName } from '../lib/room-names.js';
import { roomNameMessage } from './create-room.js';

const updateRoomRequestSchema = z.object({
    name: z.string().min(1, 'Room name is required'),
    description: z.string().min(1, 'Room description is required'),
    maxCapacity: z.number().int().positive('Max capacity must be a positive integer'),
});

type UpdateRoomRequest = z.infer<typeof updateRoomRequestSchema>;

export class UpdateRoomUseCase {
    constructor(private readonly roomRepository: RoomRepository) {}

    async execute(id: string, request: UpdateRoomRequest): Promise<{ error?: Error }> {
        const validation = updateRoomRequestSchema.safeParse(request);
        if (!validation.success) {
            return {
                error: new ValidationError(validation.error.issues.map(e => e.message).join(', ')),
            };
        }

        const existing = await this.roomRepository.findById(id);
        if (!existing) return { error: new RoomNotFoundError() };

        // Trocar o nome exige um da lista; manter um nome antigo fora da lista
        // (cadastrado antes dela existir) continua permitido.
        const name = normalizeRoomName(validation.data.name);
        if (name !== existing.name) {
            if (!isRoomName(name)) return { error: new ValidationError(roomNameMessage) };
            const other = await this.roomRepository.findByName(name);
            if (other && other.id !== id) return { error: new RoomNameAlreadyExistsError() };
        }

        await this.roomRepository.update(id, { ...validation.data,
name });
        return {};
    }
}
