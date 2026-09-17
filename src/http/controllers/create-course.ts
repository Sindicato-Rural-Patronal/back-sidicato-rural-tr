import type { FastifyRequest, FastifyReply } from 'fastify';
import type { CreateCourseUseCase } from '../../usecase/create-course.js';
import type { CopyCourseExtrasUseCase } from '../../usecase/copy-course-extras.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { requirePermission } from '../lib/require-permission.js';

type CreateCourseBody = {
    name: string;
    description: string;
    roomId: string;
    startTime: string;
    endTime: string;
    status?: 'PUBLIC' | 'PRIVATE' | 'UNPUBLISHED';
    price?: number;
    workloadHours?: number;
    registrationDeadline?: string;
    observations?: string;
    eventNumber?: string;
    minStudents?: number;
    // "Duplicar curso": o que copiar de outro curso depois de criar.
    copyCoverFromCourseId?: string;
    copyInstructorsFromCourseId?: string;
    instructorAssignmentIds?: string[];
};

export class CreateCourseController {
    constructor(
        private readonly createCourseUseCase: CreateCourseUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
        private readonly copyExtrasUseCase?: CopyCourseExtrasUseCase,
    ) {}

    async handle(request: FastifyRequest, reply: FastifyReply) {
        const adminId = await requirePermission(request, reply, 'CREATE_COURSE', this.getAdminPermissions);
        if (adminId === null) return;
        const {
            copyCoverFromCourseId,
            copyInstructorsFromCourseId,
            instructorAssignmentIds,
            ...body
        } = request.body as CreateCourseBody;
        const wantsCopy = !!(copyCoverFromCourseId || copyInstructorsFromCourseId);
        // Capa e instrutores de outro curso são alterações de curso (UPDATE_COURSE).
        if (wantsCopy) {
            const permissions = (await this.getAdminPermissions.execute(adminId)) ?? [];
            if (!permissions.includes('UPDATE_COURSE')) {
                return reply.status(403).send({ error: 'Sem permissão para copiar capa e instrutores de outro curso.' });
            }
        }
        const response = await this.createCourseUseCase.execute({
            ...body,
            status: body.status ?? 'UNPUBLISHED',
            price: body.price ?? 0,
            workloadHours: body.workloadHours ?? 0,
        });
        if (response.error) return reply.status(400).send({ error: response.error?.message });

        const courseId = response.courseId!;
        if (this.copyExtrasUseCase && wantsCopy) {
            // O curso já foi criado: se a cópia falhar, responde 201 dizendo o que
            // não veio (repetir o pedido criaria outro curso).
            const copied = await this.copyExtrasUseCase
                .execute({
                    courseId,
                    coverFromCourseId: copyCoverFromCourseId,
                    instructorsFromCourseId: copyInstructorsFromCourseId,
                    instructorAssignmentIds,
                })
                .catch(() => ({
                    ...(copyCoverFromCourseId ? { coverCopied: false } : {}),
                    ...(copyInstructorsFromCourseId ? { instructorsCopied: 0 } : {}),
                }));
            return reply.status(201).send({ id: courseId,
...copied });
        }
        return reply.status(201).send({ id: courseId });
    }
}
