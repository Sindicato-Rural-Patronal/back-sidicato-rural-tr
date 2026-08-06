import type { FastifyRequest, FastifyReply } from 'fastify';
import type { GetRegistrationFichaUseCase } from '../../usecase/get-registration-ficha.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { requireAuth } from '../lib/require-permission.js';

export class DownloadRegistrationFichaController {
    constructor(
        private readonly useCase: GetRegistrationFichaUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    async handle(
        request: FastifyRequest<{ Params: { registrationId: string } }>,
        reply: FastifyReply,
    ) {
        if ((await requireAuth(request, reply, this.getAdminPermissions)) === null) return;
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
