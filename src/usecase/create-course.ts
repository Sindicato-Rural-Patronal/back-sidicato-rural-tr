import { z } from 'zod';
import type { CourseRepository, CourseStatus } from '../ports/external/course-repository.js';
import type { RoomRepository } from '../ports/external/room-repository.js';
import { ValidationError } from '../errors/validation.js';
import { RoomNotFoundError } from '../errors/not-found.js';
import { RoomAlreadyBookedError } from '../errors/business-rule.js';

const createCourseRequestSchema = z.object({
    name: z.string().min(1, 'Course name is required'),
    description: z.string().min(1, 'Course description is required'),
    roomId: z.uuid('Room ID must be a valid UUID'),
    startTime: z.iso.datetime(),
    endTime: z.iso.datetime(),
    status: z.enum(['PUBLICO', 'PRIVADO', 'NAO_PUBLICADO'] as const).default('NAO_PUBLICADO'),
    price: z.number().min(0).default(0),
    workloadHours: z.number().int().min(0).default(0),
    registrationDeadline: z.iso.datetime().optional(),
    observations: z.string().optional(),
});

type CreateCourseRequest = z.input<typeof createCourseRequestSchema>;

type CreateCourseResponse = {
    error?: Error;
    courseId?: string;
};

export class CreateCourseUseCase {
    constructor(
        private readonly courseRepository: CourseRepository,
        private readonly roomRepository: RoomRepository,
    ) {}

    async execute(request: CreateCourseRequest): Promise<CreateCourseResponse> {
        console.log(`[CreateCourse] name="${request.name}" roomId="${request.roomId}"`);
        const validation = createCourseRequestSchema.safeParse(request);
        if (!validation.success) {
            console.log(
                `[CreateCourse] validation failed: ${validation.error.issues.map(e => e.message).join(', ')}`,
            );
            return {
                error: new ValidationError(validation.error.issues.map(e => e.message).join(', ')),
            };
        }

        const {
            name,
            description,
            roomId,
            startTime,
            endTime,
            status,
            price,
            workloadHours,
            registrationDeadline,
            observations,
        } = validation.data;

        const room = await this.roomRepository.findById(roomId);
        if (!room) {
            return { error: new RoomNotFoundError() };
        }

        const start = new Date(startTime);
        const end = new Date(endTime);

        const available = await this.courseRepository.isRoomAvailable(roomId, start, end);
        if (!available) {
            return { error: new RoomAlreadyBookedError() };
        }

        const course = await this.courseRepository.create({
            name,
            description,
            roomId,
            startTime: start,
            endTime: end,
            status: status as CourseStatus,
            price,
            workloadHours,
            registrationDeadline: registrationDeadline ? new Date(registrationDeadline) : undefined,
            observations,
        });

        if (!course) {
            return { error: new Error('Failed to create course') };
        }

        console.log(`[CreateCourse] success courseId="${course.id}"`);
        return { courseId: course.id };
    }
}
