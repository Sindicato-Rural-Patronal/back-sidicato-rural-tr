import type { PrismaClient } from '../../generated/prisma/client.js';
import { semRegistro } from './prisma-errors.js';
import { buildCourseListWhere } from './list-filters.js';
import { findRoomOccupants, lockRoom } from './room-booking-adapter.js';
import type {
    CourseRepository,
    CourseWithDetails,
    CourseCreateData,
    CourseUpdateData,
    CourseListFilters,
    CourseListOrder,
    RoomGuardedWrite,
} from '../../ports/external/course-repository.js';
import type { courseModel } from '../../generated/prisma/models/course.js';
import type { CoursePhotoModel } from '../../generated/prisma/models.js';

export function createCourseAdapter(prisma: PrismaClient): CourseRepository {
    return new CourseAdapter(prisma);
}

const courseIncludes = {
    room: { select: { name: true,
maxCapacity: true } },
    photos: { where: { isDeleted: false } },
    _count: { select: { courseUserRegistration: { where: { isDeleted: false } } } },
    instructors: {
        where: { isDeleted: false },
        include: {
            instructor: {
                include: { userData: { select: { id: true,
name: true,
avatar: true } } },
            },
        },
    },
} as const;

export class CourseAdapter implements CourseRepository {
    constructor(private prisma: PrismaClient) {}

    findById(id: string): Promise<CourseWithDetails | null> {
        return this.prisma.course.findFirst({
            where: { id,
isDeleted: false },
            include: courseIncludes,
        }) as Promise<CourseWithDetails | null>;
    }

    findAll(
        filters?: CourseListFilters,
        skip?: number,
        take?: number,
        order: CourseListOrder = 'asc',
    ): Promise<CourseWithDetails[]> {
        return this.prisma.course.findMany({
            where: buildCourseListWhere(filters),
            include: courseIncludes,
            orderBy: [{ startTime: order }, { id: 'asc' }],
            skip,
            take,
        }) as Promise<CourseWithDetails[]>;
    }

    async years(): Promise<number[]> {
        // So a data de inicio de cada curso; sao poucas centenas de linhas e
        // evita SQL cru so para um DISTINCT de ano.
        const rows = await this.prisma.course.findMany({
            where: { isDeleted: false },
            select: { startTime: true },
        });
        const anos = new Set((rows as { startTime: Date }[]).map(r => r.startTime.getUTCFullYear()));
        return [...anos].sort((a, b) => b - a);
    }

    count(filters?: CourseListFilters): Promise<number> {
        return this.prisma.course.count({ where: buildCourseListWhere(filters) });
    }

    async update(id: string, data: CourseUpdateData): Promise<courseModel | null> {
        try {
            const { roomId, ...rest } = data;
            const updateData = roomId ? { ...rest,
room: { connect: { id: roomId } } } : rest;
            return await this.prisma.course.update({ where: { id },
data: updateData });
        } catch (e) {
            return semRegistro(e, null);
        }
    }

    async delete(id: string): Promise<boolean> {
        try {
            const now = new Date();
            // Atômico: ou apaga tudo (fotos + inscrições + curso) ou nada.
            await this.prisma.$transaction([
                this.prisma.coursePhoto.updateMany({
                    where: { courseId: id },
                    data: { isDeleted: true,
deletedAt: now },
                }),
                this.prisma.courseUserRegistration.updateMany({
                    where: { courseId: id },
                    data: { isDeleted: true,
deletedAt: now },
                }),
                this.prisma.course.update({
                    where: { id },
                    data: { isDeleted: true,
deletedAt: now },
                }),
            ]);
            return true;
        } catch (e) {
            return semRegistro(e, false);
        }
    }

    async addPhoto(courseId: string, url: string, caption?: string): Promise<CoursePhotoModel> {
        return this.prisma.coursePhoto.create({
            data: { courseId,
url,
caption },
        }) as Promise<CoursePhotoModel>;
    }

    async deletePhoto(photoId: string): Promise<boolean> {
        try {
            await this.prisma.coursePhoto.update({
                where: { id: photoId },
                data: { isDeleted: true,
deletedAt: new Date() },
            });
            return true;
        } catch (e) {
            return semRegistro(e, false);
        }
    }

    // Cursos e reservas (eventos/reuniões) dividem a agenda da sala: a checagem
    // e a gravação ficam na mesma transação, com a sala travada.
    createInRoom(data: CourseCreateData): Promise<RoomGuardedWrite<courseModel>> {
        const { roomId, ...rest } = data;
        return this.prisma.$transaction(async (tx: unknown) => {
            const t = tx as PrismaClient;
            await lockRoom(t, roomId);
            const [conflict] = await findRoomOccupants(t, roomId, data.startTime, data.endTime);
            if (conflict) return { conflict };
            const result = await t.course.create({ data: { ...rest,
room: { connect: { id: roomId } } } });
            return { result };
        });
    }

    async updateInRoom(
        id: string,
        data: CourseUpdateData,
        slot: {
 roomId: string;
startTime: Date;
endTime: Date 
},
    ): Promise<RoomGuardedWrite<courseModel | null>> {
        try {
            return await this.prisma.$transaction(async (tx: unknown) => {
                const t = tx as PrismaClient;
                await lockRoom(t, slot.roomId);
                const [conflict] = await findRoomOccupants(t, slot.roomId, slot.startTime, slot.endTime, { courseId: id });
                if (conflict) return { conflict };
                const { roomId, ...rest } = data;
                const result = await t.course.update({
                    where: { id },
                    data: roomId ? { ...rest,
room: { connect: { id: roomId } } } : rest,
                });
                return { result };
            });
        } catch (e) {
            return { result: semRegistro(e, null) };
        }
    }
}
