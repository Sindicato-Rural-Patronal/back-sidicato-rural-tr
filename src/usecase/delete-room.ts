import type { RoomRepository } from '../ports/external/room-repository.js';
import { RoomNotFoundError } from '../errors/not-found.js';
import { RoomHasCoursesError } from '../errors/conflict.js';

export class DeleteRoomUseCase {
    constructor(private readonly roomRepository: RoomRepository) {}

    async execute(id: string): Promise<{ error?: Error }> {
        const existing = await this.roomRepository.findById(id);
        if (!existing) return { error: new RoomNotFoundError() };

        const linkedCourses = await this.roomRepository.countCourses(id);
        if (linkedCourses > 0) return { error: new RoomHasCoursesError() };

        await this.roomRepository.delete(id);
        return {};
    }
}
