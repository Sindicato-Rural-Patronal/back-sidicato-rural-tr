import type { FastifyRequest, FastifyReply } from 'fastify';
import type { UploadNewsBlockImageUseCase } from '../../usecase/upload-news-block-image.js';
import { errorToStatus } from '../lib/require-permission.js';

export class UploadNewsBlockImageController {
    constructor(
        private readonly useCase: UploadNewsBlockImageUseCase,
    ) {}

    async handle(request: FastifyRequest<{ Params: { newsId: string } }>, reply: FastifyReply) {
        const { newsId } = request.params;
        const data = await request.file();
        if (!data) return reply.status(400).send({ error: 'Nenhum arquivo enviado.' });
        const buffer = await data.toBuffer();
        const response = await this.useCase.execute(newsId, buffer, data.mimetype);
        if (response.error) return reply.status(errorToStatus(response.error)).send({ error: response.error.message });
        return reply.status(200).send({ url: response.url });
    }
}
