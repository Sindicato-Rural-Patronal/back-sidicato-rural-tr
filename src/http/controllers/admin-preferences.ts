import type { FastifyRequest, FastifyReply } from 'fastify';
import type { UpdateAdminPreferencesUseCase } from '../../usecase/admin-preferences.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { errorToStatus, requireAuth } from '../lib/require-permission.js';

export class AdminPreferencesController {
    constructor(
        private readonly useCase: UpdateAdminPreferencesUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    async handle(request: FastifyRequest, reply: FastifyReply) {
        // Qualquer admin logado, e sempre nas próprias preferências: o id vem do token.
        const adminId = await requireAuth(request, reply, this.getAdminPermissions);
        if (adminId === null) return;
        const result = await this.useCase.execute(adminId, request.body);
        if (result.error) {
            return reply.status(errorToStatus(result.error)).send({ error: result.error.message });
        }
        return reply.status(200).send({ dashboardPrefs: result.dashboardPrefs });
    }
}
