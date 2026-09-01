import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ListMarketQuotesUseCase } from '../../usecase/list-market-quotes.js';
import type { CreateMarketQuoteUseCase } from '../../usecase/create-market-quote.js';
import type { UpdateMarketQuoteUseCase } from '../../usecase/update-market-quote.js';
import type { DeleteMarketQuoteUseCase } from '../../usecase/delete-market-quote.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { requirePermission, errorToStatus } from '../lib/require-permission.js';

type IdParams = { id: string };

export class MarketQuoteController {
    constructor(
        private readonly listUseCase: ListMarketQuotesUseCase,
        private readonly createUseCase: CreateMarketQuoteUseCase,
        private readonly updateUseCase: UpdateMarketQuoteUseCase,
        private readonly deleteUseCase: DeleteMarketQuoteUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    // Público: só ativos, ordenados.
    async listPublic(_request: FastifyRequest, reply: FastifyReply) {
        const items = await this.listUseCase.execute(true);
        return reply.send(items);
    }

    // Admin: todos (inclui inativos).
    async listAdmin(request: FastifyRequest, reply: FastifyReply) {
        if ((await requirePermission(request, reply, 'READ_MARKET_QUOTE', this.getAdminPermissions)) === null)
            return;
        const items = await this.listUseCase.execute(false);
        return reply.send(items);
    }

    async create(request: FastifyRequest, reply: FastifyReply) {
        if ((await requirePermission(request, reply, 'CREATE_MARKET_QUOTE', this.getAdminPermissions)) === null)
            return;
        const response = await this.createUseCase.execute(request.body);
        if (response.error) {
            return reply.status(errorToStatus(response.error)).send({ error: response.error.message });
        }
        return reply.status(201).send(response.quote);
    }

    async update(request: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) {
        if ((await requirePermission(request, reply, 'UPDATE_MARKET_QUOTE', this.getAdminPermissions)) === null)
            return;
        const response = await this.updateUseCase.execute(request.params.id, request.body);
        if (response.error) {
            return reply.status(errorToStatus(response.error)).send({ error: response.error.message });
        }
        return reply.status(200).send({ message: 'ok' });
    }

    async remove(request: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) {
        if ((await requirePermission(request, reply, 'DELETE_MARKET_QUOTE', this.getAdminPermissions)) === null)
            return;
        const response = await this.deleteUseCase.execute(request.params.id);
        if (response.error) {
            return reply.status(errorToStatus(response.error)).send({ error: response.error.message });
        }
        return reply.status(204).send();
    }
}
