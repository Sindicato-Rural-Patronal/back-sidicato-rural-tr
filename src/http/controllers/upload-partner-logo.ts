import type { FastifyRequest, FastifyReply } from 'fastify';
import { errorToStatus } from '../lib/require-permission.js';
import type { UploadPartnerLogoUseCase } from '../../usecase/upload-partner-logo.js';

type Params = { id: string };

export class UploadPartnerLogoController {
    constructor(private readonly useCase: UploadPartnerLogoUseCase) {}

    async handle(req: FastifyRequest<{ Params: Params }>, reply: FastifyReply) {
        const data = await req.file();
        if (!data) return reply.status(400).send({ error: 'Nenhum arquivo enviado' });

        const chunks: Buffer[] = [];
        for await (const chunk of data.file) chunks.push(chunk);
        const file = Buffer.concat(chunks);

        const response = await this.useCase.execute({
            userId: req.params.id,
            file,
            mimeType: data.mimetype,
        });

        if (response.error) {
            return reply.status(errorToStatus(response.error)).send({ error: response.error.message });
        }
        return reply.status(200).send({ partnerLogoUrl: response.partnerLogoUrl });
    }
}
