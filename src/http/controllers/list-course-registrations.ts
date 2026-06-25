import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ListCourseRegistrationsUseCase } from '../../usecase/list-course-registrations.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { requirePermission } from '../lib/require-permission.js';

type Params = { courseId: string };
type Query = { page?: number; limit?: number };

export class ListCourseRegistrationsController {
    constructor(
        private readonly useCase: ListCourseRegistrationsUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    async handle(request: FastifyRequest<{ Params: Params; Querystring: Query }>, reply: FastifyReply) {
        if (
            (await requirePermission(request, reply, 'READ_COURSE', this.getAdminPermissions)) ===
            null
        )
            return;
        const { page = 1, limit = 20 } = request.query;
        const response = await this.useCase.execute(request.params.courseId, page, limit);
        if (response.error) return reply.status(400).send({ error: response.error?.message });
        return reply.status(200).send({
            data: response.data,
            total: response.total,
            page: response.page,
            limit: response.limit,
            totalPages: response.totalPages,
        });
    }
}
