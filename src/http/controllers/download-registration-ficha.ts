import type { FastifyRequest, FastifyReply } from 'fastify';
import type { GetRegistrationFichaUseCase } from '../../usecase/get-registration-ficha.js';

export class DownloadRegistrationFichaController {
    constructor(
        private readonly useCase: GetRegistrationFichaUseCase,
    ) {}

    async handle(
        request: FastifyRequest<{ Params: { registrationId: string } }>,
        reply: FastifyReply,
    ) {
        // A ficha traz dados pessoais: mesma permissão de ver as inscrições.
        const ficha = await this.useCase.execute(request.params.registrationId);
        if (!ficha) return reply.status(404).send({ error: 'Ficha não encontrada.' });

        reply.type(ficha.mimeType);
        reply.header(
            'Content-Disposition',
            `inline; filename="${encodeURIComponent(ficha.filename)}"`,
        );
        return reply.send(ficha.data);
    }
}
