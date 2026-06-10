import { z } from 'zod';
import type { RoomRepository } from '../ports/external/room-repository.js';
import { ValidationError } from '../errors/validation.js';

const createRoomRequestSchema = z.object({
    name: z.string().min(1, 'Room name is required'),
    description: z.string().min(1, 'Room description is required'),
    maxCapacity: z.number().int().positive('Max capacity must be a positive integer'),
});

type CreateRoomRequest = z.infer<typeof createRoomRequestSchema>;
type CreateRoomResponse = {
    error?: Error;
    roomId?: string;
};

export class CreateRoomUseCase {
    constructor(private readonly roomRepository: RoomRepository) {}

    async execute(request: CreateRoomRequest): Promise<CreateRoomResponse> {
        console.log(`[CreateRoom] name="${request.name}" maxCapacity=${request.maxCapacity}`);
        const validation = createRoomRequestSchema.safeParse(request);
        if (!validation.success) {
            console.log(
                `[CreateRoom] validation failed: ${validation.error.issues.map(e => e.message).join(', ')}`,
            );
            return {
                error: new ValidationError(validation.error.issues.map(e => e.message).join(', ')),
            };
        }

        const room = await this.roomRepository.create(validation.data);
        console.log(`[CreateRoom] success roomId="${room.id}"`);
        return { roomId: room.id };
    }
}
