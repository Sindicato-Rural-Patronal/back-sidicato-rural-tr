import type { courseModel, CoursePhotoModel } from '../../generated/prisma/models.js';
import { CourseStatus } from '../../generated/prisma/enums.js';

export { CourseStatus };

export type CourseCreateData = {
    name: string;
    description: string;
    roomId: string;
    startTime: Date;
    endTime: Date;
    status?: CourseStatus;
    price?: number;
    workloadHours?: number;
    registrationDeadline?: Date;
    observations?: string;
};

export type CourseUpdateData = {
    name?: string;
    description?: string;
    roomId?: string;
    startTime?: Date;
    endTime?: Date;
    status?: CourseStatus;
    bannerUrl?: string;
    price?: number;
    workloadHours?: number;
    registrationDeadline?: Date | null;
    observations?: string;
    eventNumber?: string;
    minStudents?: number;
    preEnrolled?: number;
    waitlist?: number;
};

export type CourseWithDetails = courseModel & {
    room: { name: string; maxCapacity: number };
    photos: CoursePhotoModel[];
    _count: { courseUserRegistration: number };
    Instructors: { userData: { name: string } }[];
};

export interface CourseRepository {
    create(course: CourseCreateData): Promise<courseModel>;
    findById(id: string): Promise<CourseWithDetails | null>;
    findAll(statusFilter?: CourseStatus): Promise<CourseWithDetails[]>;
    update(id: string, data: CourseUpdateData): Promise<courseModel | null>;
    delete(id: string): Promise<boolean>;
    isRoomAvailable(roomId: string, startTime: Date, endTime: Date, excludeCourseId?: string): Promise<boolean>;
    addPhoto(courseId: string, url: string, caption?: string): Promise<CoursePhotoModel>;
    deletePhoto(photoId: string): Promise<boolean>;
}
