import type { FastifyRequest, FastifyReply } from 'fastify';
import type { DeleteCoursePhotoUseCase } from '../../usecase/delete-course-photo.js';

export class DeleteCoursePhotoController {
    constructor(
        private readonly useCase: DeleteCoursePhotoUseCase,
    ) {}

    async handle(
        request: FastifyRequest<{
            Params: {
                courseId: string;
                photoId: string;
            };
        }>,
        reply: FastifyReply,
    ) {
        const { photoId } = request.params;
        const response = await this.useCase.execute(photoId);
        if (response.error) {
            const status = response.error?.message.includes('not found') ? 404 : 400;
            return reply.status(status).send({ error: response.error?.message });
        }
        return reply.status(204).send();
    }
}
