import type { FastifyRequest, FastifyReply } from 'fastify';
import type { UploadRegistrationFichaUseCase } from '../../usecase/upload-registration-ficha.js';
import { errorToStatus } from '../lib/require-permission.js';

export class UploadRegistrationFichaController {
    constructor(
        private readonly useCase: UploadRegistrationFichaUseCase,
    ) {}

    async handle(
        request: FastifyRequest<{ Params: { registrationId: string } }>,
        reply: FastifyReply,
    ) {
        const { registrationId } = request.params;

        const data = await request.file();
        if (!data) return reply.status(400).send({ error: 'Nenhum arquivo enviado.' });

        const chunks: Buffer[] = [];
        for await (const chunk of data.file) chunks.push(chunk);
        const fileBuffer = Buffer.concat(chunks);
        if (data.file.truncated) {
            return reply.status(400).send({ error: 'Arquivo excede o limite permitido.' });
        }

        const response = await this.useCase.execute(
            registrationId,
            fileBuffer,
            data.filename,
            data.mimetype,
        );
        if (response.error) {
            return reply.status(errorToStatus(response.error)).send({ error: response.error.message });
        }
        return reply.status(201).send({ filename: response.filename });
    }
}
