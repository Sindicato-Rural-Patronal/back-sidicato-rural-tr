import type { FastifyRequest, FastifyReply } from 'fastify';
import type { LookupUserByCpfUseCase } from '../../usecase/lookup-user-by-cpf.js';

type Params = { cpf: string };

export class LookupUserByCpfController {
    constructor(private readonly useCase: LookupUserByCpfUseCase) {}

    async handle(request: FastifyRequest<{ Params: Params }>, reply: FastifyReply) {
        const result = await this.useCase.execute(request.params.cpf);
        return reply.status(200).send(result);
    }
}
