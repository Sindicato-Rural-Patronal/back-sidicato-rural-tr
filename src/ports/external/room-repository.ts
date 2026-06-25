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
}
