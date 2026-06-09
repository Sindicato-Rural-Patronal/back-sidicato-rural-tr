import { z } from 'zod';
import type { RoomRepository } from '../ports/external/room-repository.js';
import type { UserAdminRepository } from '../ports/external/user-admin-repository.js';
import type { RuleRepository } from '../ports/external/rule-repository.js';
import { verifyPermission } from '../lib/verify-permission.js';

const createRoomRequestSchema = z.object({
    name: z.string().min(1, 'Room name is required'),
    description: z.string().min(1, 'Room description is required'),
    maxCapacity: z.number().int().positive('Max capacity must be a positive integer'),
});

type CreateRoomRequest = z.infer<typeof createRoomRequestSchema>;

type CreateRoomResponse = {
    success: boolean;
    statusCode?: number;
    error?: Error;
    roomId?: string;
};

export class CreateRoomUseCase {
    constructor(
        private readonly roomRepository: RoomRepository,
        private readonly userAdminRepository: UserAdminRepository,
        private readonly ruleRepository: RuleRepository,
    ) {}

    async execute(request: CreateRoomRequest, token: string): Promise<CreateRoomResponse> {
        console.log(`[CreateRoom] name="${request.name}" maxCapacity=${request.maxCapacity}`);
        const auth = await verifyPermission(token, 'CREATE_COURSE', this.userAdminRepository, this.ruleRepository);
        if (!auth.authorized) {
            console.log(`[CreateRoom] denied: ${auth.error}`);
            return { success: false, statusCode: auth.statusCode, error: new Error(auth.error) };
        }

        const validation = createRoomRequestSchema.safeParse(request);
        if (!validation.success) {
            console.log(`[CreateRoom] validation failed: ${validation.error.issues.map(e => e.message).join(', ')}`);
            return { success: false, error: new Error(validation.error.issues.map(e => e.message).join(', ')) };
        }

        const room = await this.roomRepository.create(validation.data);
        console.log(`[CreateRoom] success roomId="${room.id}"`);
        return { success: true, roomId: room.id };
    }
}
