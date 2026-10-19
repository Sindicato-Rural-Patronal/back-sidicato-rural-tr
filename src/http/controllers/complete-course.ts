import type { FastifyRequest, FastifyReply } from 'fastify';
import type { CompleteCourseUseCase } from '../../usecase/complete-course.js';
import { errorToStatus } from '../lib/require-permission.js';

type Params = { courseId: string };

export class CompleteCourseController {
    constructor(
        private readonly useCase: CompleteCourseUseCase,
    ) {}

    async handle(request: FastifyRequest<{ Params: Params }>, reply: FastifyReply) {
        const response = await this.useCase.execute(request.params.courseId);
        if (response.error) {
            return reply.status(errorToStatus(response.error)).send({ error: response.error.message });
        }
        return reply.status(200).send(response.course);
    }
}
