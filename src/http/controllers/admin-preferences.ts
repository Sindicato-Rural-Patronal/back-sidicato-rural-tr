import type { FastifyRequest, FastifyReply } from 'fastify';
import type { UpdateAdminPreferencesUseCase } from '../../usecase/admin-preferences.js';
import { errorToStatus } from '../lib/require-permission.js';
import { adminOf } from '../lib/route-auth.js';

export class AdminPreferencesController {
    constructor(private readonly useCase: UpdateAdminPreferencesUseCase) {}

    async handle(request: FastifyRequest, reply: FastifyReply) {
        // Qualquer admin logado, e sempre nas próprias preferências: o id vem do token.
        const result = await this.useCase.execute(adminOf(request).id, request.body);
        if (result.error) {
            return reply.status(errorToStatus(result.error)).send({ error: result.error.message });
        }
        return reply.status(200).send({ dashboardPrefs: result.dashboardPrefs });
    }
}
