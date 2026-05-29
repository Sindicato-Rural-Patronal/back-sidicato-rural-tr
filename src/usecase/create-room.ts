import { z } from 'zod';
import { RoomRepository } from '../ports/external/room-repository.js';

const createRoomRequestSchema = z.object({
    name: z.string().min(1, 'Room name is required'),
    description: z.string().min(1, 'Room description is required'),
    maxCapacity: z.number().int().positive('Max capacity must be a positive integer'),
});

type CreateRoomRequest = z.infer<typeof createRoomRequestSchema>;

type CreateRoomResponse = {
    success: boolean;
    error?: Error;
    roomId?: string;
};

export class CreateRoomUseCase {
    constructor(private readonly roomRepository: RoomRepository) {}

    async execute(request: CreateRoomRequest): Promise<CreateRoomResponse> {
        const validation = createRoomRequestSchema.safeParse(request);
        if (!validation.success) {
            return { success: false, error: new Error(validation.error.issues.map(e => e.message).join(', ')) };
        }

        const room = await this.roomRepository.create(validation.data);
        return { success: true, roomId: room.id };
    }
}
