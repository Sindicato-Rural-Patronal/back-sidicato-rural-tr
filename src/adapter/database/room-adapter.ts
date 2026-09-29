import type { PrismaClient } from '@prisma/client/extension';
import type { RoomRepository } from '../../ports/external/room-repository.js';
import type { roomModel } from '../../generated/prisma/models/room.js';

export function createRoomAdapter(prisma: PrismaClient): RoomRepository {
    return new RoomAdapter(prisma);
}

/** Sala excluída não existe para nenhuma tela: some das listas e dos selects. */
const ATIVA = { isDeleted: false } as const;

export class RoomAdapter implements RoomRepository {
    constructor(private prisma: PrismaClient) {}

    create(data: {
 name: string;
description: string;
maxCapacity: number 
}): Promise<roomModel> {
        return this.prisma.room.create({ data });
    }

    findById(id: string): Promise<roomModel | null> {
        return this.prisma.room.findFirst({ where: { id,
...ATIVA } });
    }

    findByName(name: string): Promise<roomModel | null> {
        return this.prisma.room.findFirst({ where: { name,
...ATIVA } });
    }

    findAll(skip?: number, take?: number): Promise<roomModel[]> {
        return this.prisma.room.findMany({ where: ATIVA,
orderBy: { name: 'asc' },
skip,
take });
    }

    count(): Promise<number> {
        return this.prisma.room.count({ where: ATIVA });
    }

    update(
        id: string,
        data: {
 name: string;
description: string;
maxCapacity: number 
},
    ): Promise<roomModel> {
        return this.prisma.room.update({ where: { id },
data });
    }

    // Soft-delete: o curso antigo continua apontando para a sala (a FK
    // course.roomId é obrigatória), então o histórico e a agenda de anos
    // atrás continuam inteiros — a sala só some das listas.
    async delete(id: string): Promise<boolean> {
        const { count } = await this.prisma.room.updateMany({
            where: { id,
...ATIVA },
            data: { isDeleted: true,
deletedAt: new Date() },
        });
        return count > 0;
    }

    // Cursos ainda por acontecer (ou em andamento) seguram a sala; os que já
    // terminaram, e os excluídos, não — é justamente por eles que a sala
    // ficava presa para sempre.
    countFutureCourses(roomId: string, from: Date): Promise<number> {
        return this.prisma.course.count({ where: { roomId,
isDeleted: false,
endTime: { gte: from } } });
    }

    // Reservas passadas ou excluídas também não impedem.
    countFutureBookings(roomId: string, from: Date): Promise<number> {
        return this.prisma.roomBooking.count({ where: { roomId,
isDeleted: false,
endTime: { gte: from } } });
    }
}
