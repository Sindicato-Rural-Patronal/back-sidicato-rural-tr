import type { roomModel } from '../../generated/prisma/models/room.js';

export type { roomModel };

export interface RoomRepository {
    create(data: {
 name: string;
description: string;
maxCapacity: number
}): Promise<roomModel>;
    findById(id: string): Promise<roomModel | null>;
    findAll(skip?: number, take?: number): Promise<roomModel[]>;
    count(): Promise<number>;
    update(
        id: string,
        data: { name: string; description: string; maxCapacity: number },
    ): Promise<roomModel>;
    delete(id: string): Promise<boolean>;
    countCourses(roomId: string): Promise<number>;
}
