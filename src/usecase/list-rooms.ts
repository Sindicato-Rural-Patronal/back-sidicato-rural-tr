import type { RoomRepository, roomModel } from '../ports/external/room-repository.js';

type ListRoomsResponse = {
    data?: roomModel[];
    total?: number;
    page?: number;
    limit?: number;
    totalPages?: number;
};

export class ListRoomsUseCase {
    constructor(private readonly roomRepository: RoomRepository) {}

    async execute(page = 1, limit = 20): Promise<ListRoomsResponse> {
        const skip = (page - 1) * limit;
        const [data, total] = await Promise.all([
            this.roomRepository.findAll(skip, limit),
            this.roomRepository.count(),
        ]);
        return { data,
total,
page,
limit,
totalPages: Math.ceil(total / limit) };
    }
}
