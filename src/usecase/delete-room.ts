import type { RoomRepository } from '../ports/external/room-repository.js';
import { RoomNotFoundError } from '../errors/not-found.js';
import { RoomHasBookingsError, RoomHasCoursesError } from '../errors/conflict.js';
import { nowWallClock } from './room-availability.js';

export class DeleteRoomUseCase {
    constructor(
        private readonly roomRepository: RoomRepository,
        private readonly now: () => Date = () => new Date(),
    ) {}

    async execute(id: string): Promise<{ error?: Error }> {
        const existing = await this.roomRepository.findById(id);
        if (!existing) return { error: new RoomNotFoundError() };

        const linkedCourses = await this.roomRepository.countCourses(id);
        if (linkedCourses > 0) return { error: new RoomHasCoursesError() };

        // Eventos/reuniões ainda por acontecer (ou em andamento) seguram a sala.
        const futureBookings = await this.roomRepository.countFutureBookings(id, nowWallClock(this.now()));
        if (futureBookings > 0) return { error: new RoomHasBookingsError() };

        await this.roomRepository.delete(id);
        return {};
    }
}
