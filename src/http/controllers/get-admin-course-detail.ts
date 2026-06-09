import type { FastifyRequest, FastifyReply } from 'fastify';
import type { GetAdminCourseDetailUseCase } from '../../usecase/get-admin-course-detail.js';

export class GetAdminCourseDetailController {
    constructor(private readonly useCase: GetAdminCourseDetailUseCase) {}

    async handle(request: FastifyRequest<{ Params: { courseId: string } }>, reply: FastifyReply) {
        const token = request.headers['authorization']?.replace('Bearer ', '') ?? '';
        const { courseId } = request.params;
        const response = await this.useCase.execute(token, courseId);
        if (!response.success) {
            return reply.status(response.statusCode ?? 400).send({ error: response.error?.message });
        }
        return reply.status(200).send(response.course);
    }
}
