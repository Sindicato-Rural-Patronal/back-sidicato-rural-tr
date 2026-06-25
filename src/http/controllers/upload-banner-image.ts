import type { FastifyRequest, FastifyReply } from 'fastify';
import { errorToStatus } from '../lib/require-permission.js';
import type { UploadBannerImageUseCase } from '../../usecase/upload-banner-image.js';

export class UploadBannerImageController {
    constructor(private readonly useCase: UploadBannerImageUseCase) {}

    async handle(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
        const data = await req.file();
        if (!data) return reply.status(400).send({ error: 'No file uploaded' });

        const chunks: Buffer[] = [];
        for await (const chunk of data.file) chunks.push(chunk);
        const fileBuffer = Buffer.concat(chunks);

        const response = await this.useCase.execute(req.params.id, fileBuffer);
        if (response.error) {
            return reply.status(errorToStatus(response.error)).send({ error: response.error.message });
        }
        return reply.status(200).send({ imageUrl: response.imageUrl });
    }
}
