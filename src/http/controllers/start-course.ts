import type { FastifyRequest, FastifyReply } from 'fastify';
import type { StartCourseUseCase } from '../../usecase/start-course.js';
import { errorToStatus } from '../lib/require-permission.js';

type Params = { courseId: string };

export class StartCourseController {
    constructor(
        private readonly useCase: StartCourseUseCase,
    ) {}

    async handle(request: FastifyRequest<{ Params: Params }>, reply: FastifyReply) {
        const response = await this.useCase.execute(request.params.courseId);
        if (response.error) {
            return reply.status(errorToStatus(response.error)).send({ error: response.error.message });
        }
        return reply.status(200).send({ message: 'ok' });
    }
}
