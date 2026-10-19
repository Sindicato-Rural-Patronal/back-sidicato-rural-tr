import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AddCoursePhotoUseCase } from '../../usecase/add-course-photo.js';

export class AddCoursePhotoController {
    constructor(
        private readonly useCase: AddCoursePhotoUseCase,
    ) {}

    async handle(request: FastifyRequest<{ Params: { courseId: string } }>, reply: FastifyReply) {
        const { courseId } = request.params;

        const data = await request.file();
        if (!data) return reply.status(400).send({ error: 'Nenhum arquivo enviado.' });

        const chunks: Buffer[] = [];
        for await (const chunk of data.file) chunks.push(chunk);
        const fileBuffer = Buffer.concat(chunks);
        if (data.file.truncated) return reply.status(400).send({ error: 'Arquivo excede o limite permitido.' });

        const captionField = (data.fields as Record<string, { value?: string } | undefined>)
            ?.caption;
        const caption = captionField?.value;
        const response = await this.useCase.execute(courseId, fileBuffer, data.filename, data.mimetype, caption);

        if (response.error) return reply.status(400).send({ error: response.error?.message });
        return reply.status(201).send({ url: response.url,
photoId: response.photoId });
    }
}
