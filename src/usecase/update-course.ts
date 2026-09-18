import { z } from 'zod';
import type { CourseRepository, CourseStatus } from '../ports/external/course-repository.js';
import type { RoomRepository } from '../ports/external/room-repository.js';
import { ValidationError } from '../errors/validation.js';
import { CourseNotFoundError, RoomNotFoundError } from '../errors/not-found.js';
import { RoomAlreadyBookedError } from '../errors/business-rule.js';
import { conflictMessage } from './room-availability.js';

const updateCourseBodySchema = z.object({
    name: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    roomId: z.uuid().optional(),
    startTime: z.iso.datetime().optional(),
    endTime: z.iso.datetime().optional(),
    // COMPLETED também: pela edição dá para concluir ou desfazer a conclusão.
    status: z.enum(['PUBLIC', 'PRIVATE', 'UNPUBLISHED', 'IN_PROGRESS', 'COMPLETED'] as const).optional(),
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

        // "Concluído" só vem de um curso em andamento (ou já concluído); o painel
        // conclui pelo botão próprio e a edição só permite desfazer.
        if (data.status === 'COMPLETED' && existing.status !== 'IN_PROGRESS' && existing.status !== 'COMPLETED') {
            return { error: new ValidationError('Só é possível concluir um curso que está em andamento.') };
        }

        if (data.roomId) {
            const room = await this.roomRepository.findById(data.roomId);
            if (!room) return { error: new RoomNotFoundError() };
        }

        const newRoomId = data.roomId ?? existing.roomId;
        const newStart = data.startTime ? new Date(data.startTime) : existing.startTime;
        const newEnd = data.endTime ? new Date(data.endTime) : existing.endTime;

        if (data.roomId || data.startTime || data.endTime) {
            // Sala ocupada por outro curso ou por uma reserva (evento/reunião).
            const conflict = await this.courseRepository.findRoomConflict(
                newRoomId,
                newStart,
                newEnd,
                courseId,
            );
            if (conflict) return { error: new RoomAlreadyBookedError(conflictMessage(conflict)) };
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

        return {};
    }
}
