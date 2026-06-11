import type { PrismaClient } from '@prisma/client/extension';
import type {
    CourseRepository,
    CourseWithDetails,
    CourseCreateData,
    CourseUpdateData,
    CourseStatus,
} from '../../ports/external/course-repository.js';
import type { courseModel } from '../../generated/prisma/models/course.js';
import type { CoursePhotoModel } from '../../generated/prisma/models.js';

export function createCourseAdapter(prisma: PrismaClient): CourseRepository {
    return new CourseAdapter(prisma);
}

const courseIncludes = {
    room: { select: { name: true,
maxCapacity: true } },
    photos: true,
    _count: { select: { courseUserRegistration: true } },
    instructors: { include: { userData: { select: { name: true } } } },
} as const;

export class CourseAdapter implements CourseRepository {
    constructor(private prisma: PrismaClient) {}

    create(data: CourseCreateData): Promise<courseModel> {
        const { roomId, ...rest } = data;
        return this.prisma.course.create({
            data: { ...rest,
room: { connect: { id: roomId } } },
        });
    }

    findById(id: string): Promise<CourseWithDetails | null> {
        return this.prisma.course.findUnique({
            where: { id },
            include: courseIncludes,
        }) as Promise<CourseWithDetails | null>;
    }

    findAll(
        statusFilter?: CourseStatus,
        skip?: number,
        take?: number,
    ): Promise<CourseWithDetails[]> {
        return this.prisma.course.findMany({
            where: statusFilter ? { status: statusFilter } : undefined,
            include: courseIncludes,
            orderBy: { startTime: 'asc' },
            skip,
            take,
        }) as Promise<CourseWithDetails[]>;
    }

    count(statusFilter?: CourseStatus): Promise<number> {
        return this.prisma.course.count({
            where: statusFilter ? { status: statusFilter } : undefined,
        });
    }

    async update(id: string, data: CourseUpdateData): Promise<courseModel | null> {
        try {
            const { roomId, ...rest } = data;
            const updateData = roomId ? { ...rest,
room: { connect: { id: roomId } } } : rest;
            return await this.prisma.course.update({ where: { id },
data: updateData });
        } catch {
            return null;
        }
    }

    async delete(id: string): Promise<boolean> {
        try {
            await this.prisma.coursePhoto.deleteMany({ where: { courseId: id } });
            await this.prisma.courseUserRegistration.deleteMany({ where: { courseId: id } });
            await this.prisma.course.delete({ where: { id } });
            return true;
        } catch {
            return false;
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
            await this.prisma.coursePhoto.delete({ where: { id: photoId } });
            return true;
        } catch {
            return false;
        }
    }

    async isRoomAvailable(
        roomId: string,
        startTime: Date,
        endTime: Date,
        excludeCourseId?: string,
    ): Promise<boolean> {
        const overlap = await this.prisma.course.count({
            where: {
                roomId,
                id: excludeCourseId ? { not: excludeCourseId } : undefined,
                NOT: [{ endTime: { lte: startTime } }, { startTime: { gte: endTime } }],
            },
        });
        return overlap === 0;
    }
}
