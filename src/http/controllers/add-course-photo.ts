import { FastifyRequest, FastifyReply } from 'fastify';
import { AddCoursePhotoUseCase } from '../../usecase/add-course-photo.js';

export class AddCoursePhotoController {
    constructor(private readonly useCase: AddCoursePhotoUseCase) {}

    async handle(request: FastifyRequest<{ Params: { courseId: string } }>, reply: FastifyReply) {
        const token = request.headers['authorization']?.replace('Bearer ', '') ?? '';
        const { courseId } = request.params;

        const data = await request.file();
        if (!data) return reply.status(400).send({ error: 'No file uploaded' });

        const chunks: Buffer[] = [];
        for await (const chunk of data.file) chunks.push(chunk);
        const fileBuffer = Buffer.concat(chunks);

        const caption = (data.fields as any)?.caption?.value as string | undefined;
        const response = await this.useCase.execute(token, courseId, fileBuffer, data.filename, caption);

        if (!response.success) {
            return reply.status(response.statusCode ?? 400).send({ error: response.error?.message });
        }
        return reply.status(201).send({ url: response.url, photoId: response.photoId });
    }
}
