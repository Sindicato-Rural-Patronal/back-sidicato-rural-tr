import type { FastifyRequest, FastifyReply } from 'fastify';
import type { UploadNewsBlockImageUseCase } from '../../usecase/upload-news-block-image.js';

export class UploadNewsBlockImageController {
    constructor(private useCase: UploadNewsBlockImageUseCase) {}

    async handle(request: FastifyRequest<{ Params: { newsId: string } }>, reply: FastifyReply) {
        const token = (request.headers.authorization ?? '').replace('Bearer ', '');
        const { newsId } = request.params;

        const data = await request.file();
        if (!data) return reply.status(400).send({ error: 'No file provided' });

        const buffer = await data.toBuffer();
        const response = await this.useCase.execute(newsId, token, buffer, data.mimetype);

        if (!response.success) {
            return reply.status(response.statusCode ?? 400).send({ error: response.error?.message });
        }
        return reply.status(200).send({ url: response.url });
    }
}
