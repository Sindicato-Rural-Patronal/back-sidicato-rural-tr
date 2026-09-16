import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ListMarketQuotesUseCase } from '../../usecase/list-market-quotes.js';
import type { SaveDailyQuotesUseCase } from '../../usecase/save-daily-quotes.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { requirePermission, errorToStatus } from '../lib/require-permission.js';

export class MarketQuoteController {
    constructor(
        private readonly listUseCase: ListMarketQuotesUseCase,
        private readonly saveDailyUseCase: SaveDailyQuotesUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    // Público: ativos com preço lançado, ordenados.
    async listPublic(_request: FastifyRequest, reply: FastifyReply) {
        const items = await this.listUseCase.execute(true);
        return reply.send(items);
    }

    // Admin: os produtos fixos, com ou sem preço.
    async listAdmin(request: FastifyRequest, reply: FastifyReply) {
        if ((await requirePermission(request, reply, 'READ_MARKET_QUOTE', this.getAdminPermissions)) === null)
            return;
        const items = await this.listUseCase.execute(false);
        return reply.send(items);
    }

    async saveDaily(request: FastifyRequest, reply: FastifyReply) {
        if ((await requirePermission(request, reply, 'UPDATE_MARKET_QUOTE', this.getAdminPermissions)) === null)
            return;
        const response = await this.saveDailyUseCase.execute(request.body);
        if (response.error) {
            return reply.status(errorToStatus(response.error)).send({ error: response.error.message });
        }
        const items = await this.listUseCase.execute(false);
        return reply.status(200).send(items);
    }
}
