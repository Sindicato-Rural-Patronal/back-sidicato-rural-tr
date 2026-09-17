import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { isPrismaUniqueViolation, isPrismaFkViolation } from '../lib/prisma-errors.js';

// Rede de segurança para erros não tratados: mapeia P2002 (unicidade) para 409
// e nunca vaza stack/detalhe interno num 500. Usado pelo servidor e pelos E2E.
export function apiErrorHandler(
    error: FastifyError | (Error & {
 validation?: unknown;
statusCode?: number 
}),
    request: FastifyRequest,
    reply: FastifyReply,
) {
    if (error.validation) {
        return reply.status(400).send({ error: error.message });
    }
    if (isPrismaUniqueViolation(error)) {
        return reply.status(409).send({ error: 'Registro já existe (dados únicos em conflito).' });
    }
    if (isPrismaFkViolation(error)) {
        return reply.status(409).send({ error: 'Registro em uso e não pode ser removido.' });
    }
    const status = error.statusCode ?? 500;
    if (status >= 500) {
        request.log.error(error);
        return reply.status(500).send({ error: 'Erro interno do servidor.' });
    }
    return reply.status(status).send({ error: error.message });
}
