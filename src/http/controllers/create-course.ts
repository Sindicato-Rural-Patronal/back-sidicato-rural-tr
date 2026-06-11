import type { FastifyRequest, FastifyReply } from 'fastify';
import type { CreateCourseUseCase } from '../../usecase/create-course.js';
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
};

export class CreateCourseController {
    constructor(
        private readonly createCourseUseCase: CreateCourseUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    async handle(request: FastifyRequest, reply: FastifyReply) {
        if (
            (await requirePermission(request, reply, 'CREATE_COURSE', this.getAdminPermissions)) ===
            null
        )
            return;
        const body = request.body as CreateCourseBody;
        const response = await this.createCourseUseCase.execute({
            ...body,
            status: body.status ?? 'UNPUBLISHED',
            price: body.price ?? 0,
            workloadHours: body.workloadHours ?? 0,
        });
        if (response.error) return reply.status(400).send({ error: response.error?.message });
        return reply.status(201).send({ id: response.courseId });
    }
}
