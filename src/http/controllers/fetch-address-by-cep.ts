import type { FastifyRequest, FastifyReply } from 'fastify';
import type { FetchAddressByCepUseCase } from '../../usecase/fetch-address-by-cep.js';
import { errorToStatus } from '../lib/require-permission.js';

export class FetchAddressByCepController {
    constructor(private readonly useCase: FetchAddressByCepUseCase) {}

    async handle(
        request: FastifyRequest<{ Params: { cep: string } }>,
        reply: FastifyReply,
    ) {
        const { cep } = request.params;
        const result = await this.useCase.execute(cep);
        if (result.error) {
            return reply.status(errorToStatus(result.error)).send({ error: result.error.message });
        }
        return reply.status(200).send(result.address);
    }
}
