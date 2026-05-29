import { RoomRepository, roomModel } from '../ports/external/room-repository.js';

type ListRoomsResponse = {
    success: boolean;
    rooms?: roomModel[];
};

export class ListRoomsUseCase {
    constructor(private readonly roomRepository: RoomRepository) {}

    async execute(): Promise<ListRoomsResponse> {
        const rooms = await this.roomRepository.findAll();
        return { success: true, rooms };
    }
}
