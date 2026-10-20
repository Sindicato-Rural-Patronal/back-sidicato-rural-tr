import type { FastifyRequest, FastifyReply } from 'fastify';
import type { GetAdminCourseDetailUseCase } from '../../usecase/get-admin-course-detail.js';

export class GetAdminCourseDetailController {
    constructor(
        private readonly useCase: GetAdminCourseDetailUseCase,
    ) {}

    async handle(request: FastifyRequest<{ Params: { courseId: string } }>, reply: FastifyReply) {
        const { courseId } = request.params;
        const response = await this.useCase.execute(courseId);
        if (response.error) {
            const status = response.error?.message === 'Course not found' ? 404 : 400;
            return reply.status(status).send({ error: response.error?.message });
        }
        return reply.status(200).send(response.course);
    }
}
