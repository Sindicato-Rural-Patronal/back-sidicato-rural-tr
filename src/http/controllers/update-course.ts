import { FastifyRequest, FastifyReply } from 'fastify';
import { UpdateCourseUseCase } from '../../usecase/update-course.js';

export class UpdateCourseController {
    constructor(private readonly useCase: UpdateCourseUseCase) {}

    async handle(request: FastifyRequest<{ Params: { courseId: string } }>, reply: FastifyReply) {
        const token = request.headers['authorization']?.replace('Bearer ', '') ?? '';
        const { courseId } = request.params;
        const body = request.body as Record<string, unknown>;
        const response = await this.useCase.execute({ ...body, courseId, token } as any);
        if (!response.success) {
            return reply.status(response.statusCode ?? 400).send({ error: response.error?.message });
        }
        return reply.status(200).send({ message: 'Course updated successfully' });
    }
}
