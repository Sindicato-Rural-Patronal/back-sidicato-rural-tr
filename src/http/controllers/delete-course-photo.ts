import { FastifyRequest, FastifyReply } from 'fastify';
import { DeleteCoursePhotoUseCase } from '../../usecase/delete-course-photo.js';

export class DeleteCoursePhotoController {
    constructor(private readonly useCase: DeleteCoursePhotoUseCase) {}

    async handle(request: FastifyRequest<{ Params: { courseId: string; photoId: string } }>, reply: FastifyReply) {
        const token = request.headers['authorization']?.replace('Bearer ', '') ?? '';
        const { photoId } = request.params;
        const response = await this.useCase.execute(token, photoId);
        if (!response.success) {
            const fallback = response.error?.message.includes('not found') ? 404 : 400;
            return reply.status(response.statusCode ?? fallback).send({ error: response.error?.message });
        }
        return reply.status(204).send();
    }
}
