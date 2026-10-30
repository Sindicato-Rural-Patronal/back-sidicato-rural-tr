import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { validationMessage } from './validation-message.js';
import { isPrismaUniqueViolation, isPrismaFkViolation, postgresSqlState } from '../lib/prisma-errors.js';

// Erros do Prisma que vêm do valor mandado pelo cliente, e não de defeito do
// servidor (SR-055): o banco recusa o valor e a resposta é 400.
const PRISMA_INPUT_ERRORS: Record<string, string> = {
    // Inteiro fora do int4 do Postgres (os schemas das rotas já barram; isto é a rede).
    P2020: 'Número fora do limite permitido.',
    // Texto maior que a coluna.
    P2000: 'Texto longo demais para o campo.',
    // Valor que o banco não aceita para o tipo da coluna.
    P2007: 'Valor inválido.',
};

type ZodLikeIssue = {
    path?: PropertyKey[];
    message?: string;
};

/**
 * Mensagem do `ZodError` que escapou de um `.parse` (a regra é `safeParse` ou
 * `parseQuery`, ver CLAUDE.md): o primeiro problema, já em português pelo
 * `lib/zod-config.ts`, com o campo quando a mensagem não o cita.
 */
export function zodErrorMessage(error: unknown): string | null {
    const e = error as {
        name?: unknown;
        issues?: unknown;
    } | null;
    if (!e || e.name !== 'ZodError' || !Array.isArray(e.issues)) return null;
    const issue = e.issues[0] as ZodLikeIssue | undefined;
    const message = issue?.message?.trim() || 'Dados inválidos.';
    const field = issue?.path?.map(String).join('.');
    if (!field || message.includes(field)) return message;
    return `Campo "${field}": ${message}`;
}

// Classe 22 do Postgres ("data exception"): o valor não serve para a coluna.
// Ex.: data com ano 0 ou antes de 4713 a.C. passa pelo Zod (é data válida no
// JavaScript) e o banco recusa com 22008/22009; o Prisma entrega isso como P2039.
const DATE_SQLSTATES = new Set(['22007', '22008', '22009']);

function postgresDataExceptionMessage(error: unknown): string | null {
    const state = postgresSqlState(error);
    if (!state?.startsWith('22')) return null;
    if (DATE_SQLSTATES.has(state)) return 'Data fora do intervalo aceito.';
    if (state === '22003') return PRISMA_INPUT_ERRORS.P2020;
    if (state === '22001') return PRISMA_INPUT_ERRORS.P2000;
    return 'Valor inválido.';
}

function prismaInputErrorMessage(error: unknown): string | null {
    const code = (error as { code?: unknown } | null)?.code;
    const byCode = typeof code === 'string' ? PRISMA_INPUT_ERRORS[code] : undefined;
    return byCode ?? postgresDataExceptionMessage(error);
}

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
        return reply.status(400).send({ error: validationMessage(error.validation, 'Dados inválidos.') });
    }
    const zodMessage = zodErrorMessage(error);
    if (zodMessage) {
        return reply.status(400).send({ error: zodMessage });
    }
    if (isPrismaUniqueViolation(error)) {
        return reply.status(409).send({ error: 'Registro já existe (dados únicos em conflito).' });
    }
    if (isPrismaFkViolation(error)) {
        return reply.status(409).send({ error: 'Registro em uso e não pode ser removido.' });
    }
    const inputMessage = prismaInputErrorMessage(error);
    if (inputMessage) {
        request.log.warn({
            code: (error as { code?: unknown }).code,
            sqlState: postgresSqlState(error),
        }, inputMessage);
        return reply.status(400).send({ error: inputMessage });
    }
    const status = error.statusCode ?? 500;
    if (status >= 500) {
        request.log.error(error);
        return reply.status(500).send({ error: 'Erro interno do servidor.' });
    }
    return reply.status(status).send({ error: error.message });
}
