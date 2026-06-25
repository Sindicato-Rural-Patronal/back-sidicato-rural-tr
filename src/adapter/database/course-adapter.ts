import type { PrismaClient } from '@prisma/client/extension';
import type {
    CourseRepository,
    CourseWithDetails,
    CourseCreateData,
    CourseUpdateData,
    CourseStatus,
    CourseListFilters,
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
                include: { userData: { select: { id: true, name: true, avatar: true } } },
            },
        },
    },
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
        return this.prisma.course.findFirst({
            where: { id, isDeleted: false },
            include: courseIncludes,
        }) as Promise<CourseWithDetails | null>;
    }

    findAll(filters?: CourseListFilters, skip?: number, take?: number): Promise<CourseWithDetails[]> {
        return this.prisma.course.findMany({
            where: {
                isDeleted: false,
                ...(filters?.status && { status: filters.status }),
                ...(filters?.search && {
                    name: { contains: filters.search, mode: 'insensitive' as const },
                }),
            },
            include: courseIncludes,
            orderBy: { startTime: 'asc' },
            skip,
            take,
        }) as Promise<CourseWithDetails[]>;
    }

    count(filters?: CourseListFilters): Promise<number> {
        return this.prisma.course.count({
            where: {
                isDeleted: false,
                ...(filters?.status && { status: filters.status }),
                ...(filters?.search && {
                    name: { contains: filters.search, mode: 'insensitive' as const },
                }),
            },
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
            const now = new Date();
            await this.prisma.coursePhoto.updateMany({
                where: { courseId: id },
                data: { isDeleted: true, deletedAt: now },
            });
            await this.prisma.courseUserRegistration.updateMany({
                where: { courseId: id },
                data: { isDeleted: true, deletedAt: now },
            });
            await this.prisma.course.update({
                where: { id },
                data: { isDeleted: true, deletedAt: now },
            });
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
            await this.prisma.coursePhoto.update({
                where: { id: photoId },
                data: { isDeleted: true, deletedAt: new Date() },
            });
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
                isDeleted: false,
                id: excludeCourseId ? { not: excludeCourseId } : undefined,
                NOT: [{ endTime: { lte: startTime } }, { startTime: { gte: endTime } }],
            },
        });
        return overlap === 0;
    }
}
