import type { FastifyRequest, FastifyReply } from 'fastify';
import type { DeleteCourseUseCase } from '../../usecase/delete-course.js';

export class DeleteCourseController {
    constructor(private readonly useCase: DeleteCourseUseCase) {}

    async handle(request: FastifyRequest<{ Params: { courseId: string } }>, reply: FastifyReply) {
        const token = request.headers['authorization']?.replace('Bearer ', '') ?? '';
        const { courseId } = request.params;
        const response = await this.useCase.execute(token, courseId);
        if (!response.success) {
            const fallback = response.error?.message.includes('not found') ? 404 : 400;
            return reply.status(response.statusCode ?? fallback).send({ error: response.error?.message });
        }
        return reply.status(204).send();
    }
}
