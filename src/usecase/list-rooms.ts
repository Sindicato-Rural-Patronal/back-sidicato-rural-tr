import type { RoomRepository, roomModel } from '../ports/external/room-repository.js';
import { paginate } from '../lib/pagination.js';

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
        return paginate(
            page,
            limit,
            (skip, take) => this.roomRepository.findAll(skip, take),
            () => this.roomRepository.count(),
        );
    }
}
