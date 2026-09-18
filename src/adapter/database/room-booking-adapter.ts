import type { PrismaClient } from '@prisma/client/extension';
import type {
    BookingType,
    ConflictGuard,
    GuardedWrite,
    OccupantExclusion,
    RoomBookingCreateData,
    RoomBookingFilters,
    RoomBookingItem,
    RoomBookingRepository,
    RoomBookingUpdateData,
    RoomOccupant,
    RoomScheduleItem,
    PublicEventItem,
} from '../../ports/external/room-booking-repository.js';

export function createRoomBookingAdapter(prisma: PrismaClient): RoomBookingRepository {
    return new RoomBookingAdapter(prisma);
}

const insensitive = (value: string) => ({ contains: value,
mode: 'insensitive' as const });

/** Filtros da listagem e da exportação (com `ids`, só esses). */
export function buildRoomBookingWhere(f: RoomBookingFilters) {
    if (f.ids?.length) return { isDeleted: false,
id: { in: f.ids } };
    const search = f.search?.trim();
    return {
        isDeleted: false,
        // Sobrepõe o período: começa antes do fim e termina depois do início.
        ...(f.to && { startTime: { lt: f.to } }),
        ...(f.from && { endTime: { gt: f.from } }),
        ...(f.roomId && { roomId: f.roomId }),
        ...(f.type && { type: f.type }),
        ...(search && {
            OR: [
                { title: insensitive(search) },
                { description: insensitive(search) },
                { responsibleName: insensitive(search) },
                { responsible: { name: insensitive(search) } },
            ],
        }),
    };
}

export const roomBookingSelect = {
    id: true,
    type: true,
    title: true,
    description: true,
    publicOnSite: true,
    publicDescription: true,
    roomId: true,
    startTime: true,
    endTime: true,
    responsibleName: true,
    seriesId: true,
    room: { select: { name: true } },
    responsible: { select: { id: true,
name: true } },
} as const;

type BookingRow = Omit<RoomBookingItem, 'roomName'> & { room: { name: string } };

export function toRoomBookingItem(row: BookingRow): RoomBookingItem {
    const { room, ...rest } = row;
    return { ...rest,
roomName: room.name,
responsible: row.responsible ?? null };
}

/**
 * Cursos e reservas não excluídos da sala que sobrepõem [start, end), por início.
 * Compartilhado com o adapter de cursos (criar/editar curso também respeita reservas).
 */
export async function findRoomOccupants(
    prisma: PrismaClient,
    roomId: string,
    start: Date,
    end: Date,
    exclude?: OccupantExclusion,
): Promise<RoomOccupant[]> {
    const overlap = { roomId,
isDeleted: false,
startTime: { lt: end },
endTime: { gt: start } };
    // Em sequência: dentro de transação interativa as consultas usam a mesma conexão.
    const courses: {
 id: string;
name: string;
startTime: Date;
endTime: Date 
}[] = await prisma.course.findMany({
        where: { ...overlap,
...(exclude?.courseId && { id: { not: exclude.courseId } }) },
        select: { id: true,
name: true,
startTime: true,
endTime: true },
    });
    const bookings: {
 id: string;
type: BookingType;
title: string;
startTime: Date;
endTime: Date 
}[] =
        await prisma.roomBooking.findMany({
            where: { ...overlap,
...(exclude?.bookingId && { id: { not: exclude.bookingId } }) },
            select: { id: true,
type: true,
title: true,
startTime: true,
endTime: true },
        });
    return [
        ...courses.map(c => ({ kind: 'COURSE' as const,
id: c.id,
title: c.name,
startTime: c.startTime,
endTime: c.endTime })),
        ...bookings.map(b => ({ kind: b.type,
id: b.id,
title: b.title,
startTime: b.startTime,
endTime: b.endTime })),
    ].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
}

// Serializa as gravações de reserva da mesma sala (duas pessoas marcando o mesmo
// horário ao mesmo tempo): trava liberada no fim da transação.
async function lockRoom(tx: PrismaClient, roomId: string): Promise<void> {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`room-booking:${roomId}`}))`;
}

class RoomBookingAdapter implements RoomBookingRepository {
    constructor(private prisma: PrismaClient) {}

    async list(filters: RoomBookingFilters): Promise<RoomBookingItem[]> {
        const rows: BookingRow[] = await this.prisma.roomBooking.findMany({
            where: buildRoomBookingWhere(filters),
            select: roomBookingSelect,
            orderBy: [{ startTime: 'asc' }, { title: 'asc' }],
        });
        return rows.map(toRoomBookingItem);
    }

    async schedule({ from, to, roomId }: {
 from: Date;
to: Date;
roomId?: string 
}): Promise<RoomScheduleItem[]> {
        const where = { isDeleted: false,
startTime: { lt: to },
endTime: { gt: from },
...(roomId && { roomId }) };
        const courses: {
            id: string;
            name: string;
            roomId: string;
            startTime: Date;
            endTime: Date;
            status: string;
            room: { name: string };
        }[] = await this.prisma.course.findMany({
            where,
            select: { id: true,
name: true,
roomId: true,
startTime: true,
endTime: true,
status: true,
room: { select: { name: true } } },
        });
        const bookings: BookingRow[] = await this.prisma.roomBooking.findMany({ where,
select: roomBookingSelect });
        const items: RoomScheduleItem[] = [
            ...courses.map(c => ({
                kind: 'COURSE' as const,
                id: c.id,
                title: c.name,
                roomId: c.roomId,
                roomName: c.room.name,
                startTime: c.startTime,
                endTime: c.endTime,
                status: c.status,
                seriesId: null,
                publicOnSite: false,
            })),
            ...bookings.map(b => ({
                kind: b.type,
                id: b.id,
                title: b.title,
                roomId: b.roomId,
                roomName: b.room.name,
                startTime: b.startTime,
                endTime: b.endTime,
                status: null,
                seriesId: b.seriesId,
                publicOnSite: b.publicOnSite,
            })),
        ];
        return items.sort((a, b) => a.startTime.getTime() - b.startTime.getTime() || a.title.localeCompare(b.title));
    }

    async listPublicEvents(from: Date, limit: number): Promise<PublicEventItem[]> {
        const rows: {
            id: string;
            title: string;
            publicDescription: string | null;
            startTime: Date;
            endTime: Date;
            room: { name: string };
        }[] = await this.prisma.roomBooking.findMany({
            // Reunião nunca vai para o site, mesmo que a flag fique marcada.
            where: { isDeleted: false,
publicOnSite: true,
type: 'EVENT',
endTime: { gte: from } },
            select: {
                id: true,
                title: true,
                publicDescription: true,
                startTime: true,
                endTime: true,
                room: { select: { name: true } },
            },
            orderBy: [{ startTime: 'asc' }, { title: 'asc' }],
            take: limit,
        });
        return rows.map(r => ({
            id: r.id,
            title: r.title,
            description: r.publicDescription,
            startTime: r.startTime,
            endTime: r.endTime,
            roomName: r.room.name,
        }));
    }

    async findById(id: string): Promise<RoomBookingItem | null> {
        const row: BookingRow | null = await this.prisma.roomBooking.findFirst({
            where: { id,
isDeleted: false },
            select: roomBookingSelect,
        });
        return row ? toRoomBookingItem(row) : null;
    }

    occupants(roomId: string, start: Date, end: Date, exclude?: OccupantExclusion): Promise<RoomOccupant[]> {
        return findRoomOccupants(this.prisma, roomId, start, end, exclude);
    }

    async createMany(rows: RoomBookingCreateData[], guard: ConflictGuard): Promise<GuardedWrite<string[]>> {
        const roomId = rows[0].roomId;
        const start = new Date(Math.min(...rows.map(r => r.startTime.getTime())));
        const end = new Date(Math.max(...rows.map(r => r.endTime.getTime())));
        return this.prisma.$transaction(async (tx: unknown) => {
            const t = tx as PrismaClient;
            await lockRoom(t, roomId);
            const conflict = guard(await findRoomOccupants(t, roomId, start, end));
            if (conflict) return { conflict };
            const ids: string[] = [];
            for (const data of rows) {
                const created: { id: string } = await t.roomBooking.create({ data,
select: { id: true } });
                ids.push(created.id);
            }
            return { result: ids };
        });
    }

    async update(
        id: string,
        data: RoomBookingUpdateData,
        slot: {
 roomId: string;
startTime: Date;
endTime: Date 
},
        guard: ConflictGuard | null,
    ): Promise<GuardedWrite<RoomBookingItem>> {
        return this.prisma.$transaction(async (tx: unknown) => {
            const t = tx as PrismaClient;
            if (guard) {
                await lockRoom(t, slot.roomId);
                const occupants = await findRoomOccupants(t, slot.roomId, slot.startTime, slot.endTime, { bookingId: id });
                const conflict = guard(occupants);
                if (conflict) return { conflict };
            }
            const row: BookingRow = await t.roomBooking.update({ where: { id },
data,
select: roomBookingSelect });
            return { result: toRoomBookingItem(row) };
        });
    }

    async softDelete(booking: RoomBookingItem, scope: 'one' | 'future'): Promise<number> {
        const now = new Date();
        const where =
            scope === 'future' && booking.seriesId
                ? { seriesId: booking.seriesId,
isDeleted: false,
startTime: { gte: booking.startTime } }
                : { id: booking.id,
isDeleted: false };
        const { count }: { count: number } = await this.prisma.roomBooking.updateMany({
            where,
            data: { isDeleted: true,
deletedAt: now },
        });
        return count;
    }

    async personExists(userDataId: string): Promise<boolean> {
        return (await this.prisma.userData.count({ where: { id: userDataId,
isDeleted: false } })) > 0;
    }

    async roomExists(roomId: string): Promise<boolean> {
        return (await this.prisma.room.count({ where: { id: roomId } })) > 0;
    }
}
