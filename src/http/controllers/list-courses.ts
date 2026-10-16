import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ListCoursesUseCase } from '../../usecase/list-courses.js';

export class ListCoursesController {
    constructor(private readonly useCase: ListCoursesUseCase) {}

    async handle(request: FastifyRequest, reply: FastifyReply) {
        const q = request.query as Record<string, string>;
        const page = Math.max(1, Number(q.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
        // Sem `ended=exclude` os terminados vêm no fim (o /cursos do site tem o filtro "Encerrados").
        const ended = q.ended === 'exclude' ? 'exclude' : 'include';
        const response = await this.useCase.execute({ page,
limit,
ended });
        return reply.status(200).send(response.result);
    }
}
