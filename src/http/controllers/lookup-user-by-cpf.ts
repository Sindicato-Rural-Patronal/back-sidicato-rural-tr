import type { FastifyRequest, FastifyReply } from 'fastify';
import type { LookupUserByCpfUseCase } from '../../usecase/lookup-user-by-cpf.js';
import { errorToStatus } from '../lib/require-permission.js';

type Body = {
 cpf: string;
phoneEnd: string 
};

export class LookupUserByCpfController {
    constructor(private readonly useCase: LookupUserByCpfUseCase) {}

    async handle(request: FastifyRequest<{ Body: Body }>, reply: FastifyReply) {
        const { cpf, phoneEnd } = request.body;
        const result = await this.useCase.execute({ cpf,
phoneEnd });
        if (result.error) {
            return reply.status(errorToStatus(result.error)).send({ error: result.error.message });
        }
        return reply.status(200).send({ found: result.found,
name: result.name });
    }
}
