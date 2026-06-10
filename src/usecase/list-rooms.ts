import type { RoomRepository, roomModel } from '../ports/external/room-repository.js';

type ListRoomsResponse = {rooms?: roomModel[];};

export class ListRoomsUseCase {
    constructor(private readonly roomRepository: RoomRepository) {}

    async execute(): Promise<ListRoomsResponse> {
        console.log(`[ListRooms] fetching all rooms`);
        const rooms = await this.roomRepository.findAll();
        console.log(`[ListRooms] returning ${rooms.length} rooms`);
        return { rooms };
    }
}
