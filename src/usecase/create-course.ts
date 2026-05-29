import { z } from 'zod';
import type { CourseRepository, CourseStatus } from '../ports/external/course-repository.js';
import type { RoomRepository } from '../ports/external/room-repository.js';

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
    success: boolean;
    error?: Error;
    courseId?: string;
};

export class CreateCourseUseCase {
    constructor(
        private readonly courseRepository: CourseRepository,
        private readonly roomRepository: RoomRepository,
    ) {}

    async execute(request: CreateCourseRequest): Promise<CreateCourseResponse> {
        const validation = createCourseRequestSchema.safeParse(request);
        if (!validation.success) {
            return { success: false, error: new Error(validation.error.issues.map(e => e.message).join(', ')) };
        }

        const { name, description, roomId, startTime, endTime, status, price, workloadHours, registrationDeadline, observations } = validation.data;

        const room = await this.roomRepository.findById(roomId);
        if (!room) {
            return { success: false, error: new Error('Room not found') };
        }

        const start = new Date(startTime);
        const end = new Date(endTime);

        const available = await this.courseRepository.isRoomAvailable(roomId, start, end);
        if (!available) {
            return { success: false, error: new Error('Room is already booked for this period') };
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
            return { success: false, error: new Error('Failed to create course') };
        }

        return { success: true, courseId: course.id };
    }
}
