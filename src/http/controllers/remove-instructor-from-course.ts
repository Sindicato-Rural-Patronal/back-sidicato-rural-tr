import type { FastifyRequest, FastifyReply } from 'fastify';
import type { RemoveInstructorFromCourseUseCase } from '../../usecase/remove-instructor-from-course.js';
import { errorToStatus } from '../lib/require-permission.js';

export class RemoveInstructorFromCourseController {
    constructor(
        private readonly useCase: RemoveInstructorFromCourseUseCase,
    ) {}

    async handle(
        request: FastifyRequest<{
 Params: {
 courseId: string;
assignmentId: string 
} 
}>,
        reply: FastifyReply,
    ) {
        const { assignmentId } = request.params;
        const result = await this.useCase.execute(assignmentId);
        if (result.error) {
            return reply.status(errorToStatus(result.error)).send({ error: result.error.message });
        }
        return reply.status(204).send();
    }
}
