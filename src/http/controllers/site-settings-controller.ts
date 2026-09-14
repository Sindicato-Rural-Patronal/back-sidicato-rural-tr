import type { FastifyRequest, FastifyReply } from 'fastify';
import type { GetSiteSettingsUseCase } from '../../usecase/get-site-settings.js';
import type { UpdateSiteSettingsUseCase } from '../../usecase/update-site-settings.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { requirePermission, errorToStatus } from '../lib/require-permission.js';

export class SiteSettingsController {
    constructor(
        private readonly getUseCase: GetSiteSettingsUseCase,
        private readonly updateUseCase: UpdateSiteSettingsUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    // Público: redes sociais para o rodapé.
    async getPublic(_request: FastifyRequest, reply: FastifyReply) {
        return reply.send(await this.getUseCase.execute());
    }

    async getAdmin(request: FastifyRequest, reply: FastifyReply) {
        // Sem permissão dedicada (evita bootstrap): gerido por quem cuida do
        // conteúdo do site (permissão de banners).
        if ((await requirePermission(request, reply, 'READ_BANNER', this.getAdminPermissions)) === null)
            return;
        return reply.send(await this.getUseCase.execute());
    }

    async update(request: FastifyRequest, reply: FastifyReply) {
        if ((await requirePermission(request, reply, 'UPDATE_BANNER', this.getAdminPermissions)) === null)
            return;
        const response = await this.updateUseCase.execute(request.body);
        if (response.error) {
            return reply.status(errorToStatus(response.error)).send({ error: response.error.message });
        }
        return reply.status(200).send({ message: 'ok' });
    }
}
