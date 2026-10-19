import { z } from 'zod';
import type { RoomRepository } from '../ports/external/room-repository.js';
import { ValidationError } from '../errors/validation.js';
import { RoomNameAlreadyExistsError } from '../errors/conflict.js';
import { ROOM_NAMES, isRoomName, normalizeRoomName } from '../lib/room-names.js';

export const roomNameMessage = `Escolha uma sala da lista: ${ROOM_NAMES.join(', ')}`;

const createRoomRequestSchema = z.object({
    name: z.string().min(1, 'Informe o nome da sala.'),
    description: z.string().min(1, 'Informe a descrição da sala.'),
    maxCapacity: z.number().int().positive('A capacidade máxima precisa ser um número inteiro maior que zero.'),
});

type CreateRoomRequest = z.infer<typeof createRoomRequestSchema>;
type CreateRoomResponse = {
    error?: Error;
    roomId?: string;
};

export class CreateRoomUseCase {
    constructor(private readonly roomRepository: RoomRepository) {}

    async execute(request: CreateRoomRequest): Promise<CreateRoomResponse> {
        const validation = createRoomRequestSchema.safeParse(request);
        if (!validation.success) {
            return {
                error: new ValidationError(validation.error.issues.map(e => e.message).join(', ')),
            };
        }

        const name = normalizeRoomName(validation.data.name);
        if (!isRoomName(name)) return { error: new ValidationError(roomNameMessage) };
        if (await this.roomRepository.findByName(name)) return { error: new RoomNameAlreadyExistsError() };

        const room = await this.roomRepository.create({ ...validation.data,
name });
        return { roomId: room.id };
    }
}
