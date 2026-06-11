import { z } from 'zod';
import type { CourseRepository, CourseStatus } from '../ports/external/course-repository.js';
import type { RoomRepository } from '../ports/external/room-repository.js';
import { ValidationError } from '../errors/validation.js';
import { CourseNotFoundError, RoomNotFoundError } from '../errors/not-found.js';
import { RoomAlreadyBookedError } from '../errors/business-rule.js';

const updateCourseBodySchema = z.object({
    name: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    roomId: z.uuid().optional(),
    startTime: z.iso.datetime().optional(),
    endTime: z.iso.datetime().optional(),
    status: z.enum(['PUBLIC', 'PRIVATE', 'UNPUBLISHED'] as const).optional(),
    price: z.number().min(0).optional(),
    workloadHours: z.number().int().min(0).optional(),
    registrationDeadline: z.iso.datetime().nullable().optional(),
    observations: z.string().optional(),
    eventNumber: z.string().optional(),
    minStudents: z.number().int().min(0).optional(),
    preEnrolled: z.number().int().min(0).optional(),
    waitlist: z.number().int().min(0).optional(),
});

export type UpdateCourseRequest = z.infer<typeof updateCourseBodySchema> & { courseId: string };

type UpdateCourseResponse = { error?: Error };

export class UpdateCourseUseCase {
    constructor(
        private readonly courseRepository: CourseRepository,
        private readonly roomRepository: RoomRepository,
    ) {}

    async execute(request: UpdateCourseRequest): Promise<UpdateCourseResponse> {
        console.log(`[UpdateCourse] courseId="${request.courseId}"`);
        const { courseId, ...body } = request;
        const validation = updateCourseBodySchema.safeParse(body);
        if (!validation.success) {
            return {
                error: new ValidationError(validation.error.issues.map(e => e.message).join(', ')),
            };
        }

        const existing = await this.courseRepository.findById(courseId);
        if (!existing) return { error: new CourseNotFoundError() };

        const data = validation.data;

        if (data.roomId) {
            const room = await this.roomRepository.findById(data.roomId);
            if (!room) return { error: new RoomNotFoundError() };
        }

        const newRoomId = data.roomId ?? existing.roomId;
        const newStart = data.startTime ? new Date(data.startTime) : existing.startTime;
        const newEnd = data.endTime ? new Date(data.endTime) : existing.endTime;

        if (data.roomId || data.startTime || data.endTime) {
            const available = await this.courseRepository.isRoomAvailable(
                newRoomId,
                newStart,
                newEnd,
                courseId,
            );
            if (!available) return { error: new RoomAlreadyBookedError() };
        }

        const updatePayload: Parameters<CourseRepository['update']>[1] = {
            ...data,
            startTime: data.startTime ? new Date(data.startTime) : undefined,
            endTime: data.endTime ? new Date(data.endTime) : undefined,
            registrationDeadline:
                data.registrationDeadline !== undefined
                    ? data.registrationDeadline
                        ? new Date(data.registrationDeadline)
                        : null
                    : undefined,
            status: data.status as CourseStatus | undefined,
        };

        const updated = await this.courseRepository.update(courseId, updatePayload);
        if (!updated) return { error: new Error('Failed to update course') };

        console.log(`[UpdateCourse] success courseId="${courseId}"`);
        return {};
    }
}
