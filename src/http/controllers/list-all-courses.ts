import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ListAllCoursesUseCase } from '../../usecase/list-all-courses.js';

export class ListAllCoursesController {
    constructor(private readonly useCase: ListAllCoursesUseCase) {}

    async handle(request: FastifyRequest, reply: FastifyReply) {
        const token = request.headers['authorization']?.replace('Bearer ', '') ?? '';
        const q = request.query as Record<string, string>;
        const page = Math.max(1, Number(q.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
        const response = await this.useCase.execute(token, page, limit);
        if (!response.success) {
            return reply.status(response.statusCode ?? 400).send({ error: response.error?.message });
        }
        return reply.status(200).send(response.result);
    }
}
