import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ListAllCoursesUseCase } from '../../usecase/list-all-courses.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import type { CourseStatus } from '../../ports/external/course-repository.js';
import { requirePermission } from '../lib/require-permission.js';

export class ListAllCoursesController {
    constructor(
        private readonly useCase: ListAllCoursesUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    async handle(request: FastifyRequest, reply: FastifyReply) {
        if (
            (await requirePermission(request, reply, 'READ_COURSE', this.getAdminPermissions)) ===
            null
        )
            return;
        const q = request.query as Record<string, string>;
        const page = Math.max(1, Number(q.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
        const ano = Number(q.year);
        const filters = {
            status: (q.status as CourseStatus) || undefined,
            search: q.search || undefined,
            year: Number.isInteger(ano) && ano >= 1990 && ano <= 2100 ? ano : undefined,
        };
        const response = await this.useCase.execute(page, limit, filters);
        if (response.error) return reply.status(400).send({ error: response.error?.message });
        return reply.status(200).send(response.result);
    }
}
