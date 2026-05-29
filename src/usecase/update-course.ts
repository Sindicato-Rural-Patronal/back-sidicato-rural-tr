import { z } from 'zod';
import { CourseRepository, CourseStatus } from '../ports/external/course-repository.js';
import { RoomRepository } from '../ports/external/room-repository.js';
import { UserAdminRepository } from '../ports/external/user-admin-repository.js';
import { RuleRepository } from '../ports/external/rule-repository.js';
import { verifyPermission } from '../lib/verify-permission.js';

const updateCourseBodySchema = z.object({
    name: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    roomId: z.uuid().optional(),
    startTime: z.iso.datetime().optional(),
    endTime: z.iso.datetime().optional(),
    status: z.enum(['PUBLICO', 'PRIVADO', 'NAO_PUBLICADO'] as const).optional(),
    price: z.number().min(0).optional(),
    workloadHours: z.number().int().min(0).optional(),
    registrationDeadline: z.iso.datetime().nullable().optional(),
    observations: z.string().optional(),
    eventNumber: z.string().optional(),
    minStudents: z.number().int().min(0).optional(),
    preEnrolled: z.number().int().min(0).optional(),
    waitlist: z.number().int().min(0).optional(),
});

type UpdateCourseRequest = z.infer<typeof updateCourseBodySchema> & { courseId: string; token: string };

type UpdateCourseResponse = { success: boolean; statusCode?: number; error?: Error };

export class UpdateCourseUseCase {
    constructor(
        private readonly courseRepository: CourseRepository,
        private readonly roomRepository: RoomRepository,
        private readonly userAdminRepository: UserAdminRepository,
        private readonly ruleRepository: RuleRepository,
    ) {}

    async execute(request: UpdateCourseRequest): Promise<UpdateCourseResponse> {
        const auth = await verifyPermission(request.token, 'UPDATE_COURSE', this.userAdminRepository, this.ruleRepository);
        if (!auth.authorized) return { success: false, statusCode: auth.statusCode, error: new Error(auth.error) };

        const { courseId, token, ...body } = request;
        const validation = updateCourseBodySchema.safeParse(body);
        if (!validation.success) {
            return { success: false, error: new Error(validation.error.issues.map(e => e.message).join(', ')) };
        }

        const existing = await this.courseRepository.findById(courseId);
        if (!existing) return { success: false, error: new Error('Course not found') };

        const data = validation.data;

        if (data.roomId) {
            const room = await this.roomRepository.findById(data.roomId);
            if (!room) return { success: false, error: new Error('Room not found') };
        }

        const newRoomId = data.roomId ?? existing.roomId;
        const newStart = data.startTime ? new Date(data.startTime) : existing.startTime;
        const newEnd = data.endTime ? new Date(data.endTime) : existing.endTime;

        if (data.roomId || data.startTime || data.endTime) {
            const available = await this.courseRepository.isRoomAvailable(newRoomId, newStart, newEnd, courseId);
            if (!available) return { success: false, error: new Error('Room is already booked for this period') };
        }

        const updatePayload: Parameters<CourseRepository['update']>[1] = {
            ...data,
            startTime: data.startTime ? new Date(data.startTime) : undefined,
            endTime: data.endTime ? new Date(data.endTime) : undefined,
            registrationDeadline: data.registrationDeadline !== undefined
                ? (data.registrationDeadline ? new Date(data.registrationDeadline) : null)
                : undefined,
            status: data.status as CourseStatus | undefined,
        };

        const updated = await this.courseRepository.update(courseId, updatePayload);
        if (!updated) return { success: false, error: new Error('Failed to update course') };

        return { success: true };
    }
}
