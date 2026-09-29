import { z } from 'zod';
import type { CourseRepository, CourseStatus } from '../ports/external/course-repository.js';
import type { RoomRepository } from '../ports/external/room-repository.js';
import { ValidationError } from '../errors/validation.js';
import { RoomNotFoundError } from '../errors/not-found.js';
import { RoomAlreadyBookedError } from '../errors/business-rule.js';
import { conflictMessage } from './room-availability.js';
import { nomeDoCurso } from '../lib/course-name.js';

const createCourseRequestSchema = z.object({
    // Titulo em branco e permitido: vira o nome generico. Cadastro de curso
    // costuma comecar pela sala e pelas datas, para reservar a agenda.
    name: z.preprocess(v => nomeDoCurso(typeof v === 'string' ? v : null), z.string().min(1)),
    description: z.string().min(1, 'Course description is required'),
    roomId: z.uuid('Room ID must be a valid UUID'),
    startTime: z.iso.datetime(),
    endTime: z.iso.datetime(),
    status: z.enum(['PUBLIC', 'PRIVATE', 'UNPUBLISHED'] as const).default('UNPUBLISHED'),
    price: z.number().min(0).default(0),
    workloadHours: z.number().int().min(0).default(0),
    registrationDeadline: z.iso.datetime().optional(),
    observations: z.string().optional(),
    eventNumber: z.string().optional(),
    minStudents: z.number().int().min(0).optional(),
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
        const validation = createCourseRequestSchema.safeParse(request);
        if (!validation.success) {
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
            eventNumber,
            minStudents,
        } = validation.data;

        const room = await this.roomRepository.findById(roomId);
        if (!room) {
            return { error: new RoomNotFoundError() };
        }

        const start = new Date(startTime);
        const end = new Date(endTime);

        // Sala ocupada por outro curso ou por uma reserva (evento/reunião).
        const conflict = await this.courseRepository.findRoomConflict(roomId, start, end);
        if (conflict) {
            return { error: new RoomAlreadyBookedError(conflictMessage(conflict)) };
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
            eventNumber,
            minStudents,
        });

        if (!course) {
            return { error: new Error('Failed to create course') };
        }
        return { courseId: course.id };
    }
}
