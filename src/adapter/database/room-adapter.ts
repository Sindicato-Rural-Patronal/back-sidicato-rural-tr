import { PrismaClient } from '@prisma/client/extension';
import { RoomRepository } from '../../ports/external/room-repository.js';
import { roomModel } from '../../generated/prisma/models/room.js';

export function createRoomAdapter(prisma: PrismaClient): RoomRepository {
    return new RoomAdapter(prisma);
}

export class RoomAdapter implements RoomRepository {
    constructor(private prisma: PrismaClient) {}

    create(data: { name: string; description: string; maxCapacity: number }): Promise<roomModel> {
        return this.prisma.room.create({ data });
    }

    findById(id: string): Promise<roomModel | null> {
        return this.prisma.room.findUnique({ where: { id } });
    }

    findAll(): Promise<roomModel[]> {
        return this.prisma.room.findMany({ orderBy: { name: 'asc' } });
    }
}
