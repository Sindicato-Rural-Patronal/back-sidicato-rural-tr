import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ListCourseRegistrationsUseCase } from '../../usecase/list-course-registrations.js';

type Params = { courseId: string };

export class ListCourseRegistrationsController {
    constructor(private readonly useCase: ListCourseRegistrationsUseCase) {}

    async handle(request: FastifyRequest<{ Params: Params }>, reply: FastifyReply) {
        const token = request.headers['authorization']?.replace('Bearer ', '') ?? '';
        const response = await this.useCase.execute({ token, courseId: request.params.courseId });
        if (!response.success) {
            return reply.status(response.statusCode ?? 400).send({ error: response.error?.message });
        }
        return reply.status(200).send(response.registrations);
    }
}
