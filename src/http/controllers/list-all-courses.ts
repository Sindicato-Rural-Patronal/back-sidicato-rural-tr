import { FastifyRequest, FastifyReply } from 'fastify';
import { ListAllCoursesUseCase } from '../../usecase/list-all-courses.js';

export class ListAllCoursesController {
    constructor(private readonly useCase: ListAllCoursesUseCase) {}

    async handle(request: FastifyRequest, reply: FastifyReply) {
        const token = request.headers['authorization']?.replace('Bearer ', '') ?? '';
        const response = await this.useCase.execute(token);
        if (!response.success) {
            return reply.status(response.statusCode ?? 400).send({ error: response.error?.message });
        }
        return reply.status(200).send(response.courses);
    }
}
