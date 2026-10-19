import type { FastifyRequest } from 'fastify';

// Limites por IP das rotas públicas que recebem CPF ou dados pessoais
// (inscrição, consulta por CPF, formulário de contato). Mesmo mecanismo do
// login (`config.rateLimit` na rota, contado pelo plugin registrado em
// index.ts): sem ele só valia o global de 600/min, o que deixava consultar
// CPFs em massa. Uma pessoa preenchendo o formulário faz poucas chamadas.

function tooManyRequests(_req: FastifyRequest, context: { statusCode: number }) {
    const err = new Error('Muitas tentativas seguidas. Aguarde um minuto e tente de novo.') as Error & {statusCode: number;};
    err.statusCode = context.statusCode;
    return err;
}

/** Envio de formulário: inscrição em curso e mensagem de contato. */
export const PUBLIC_FORM_LIMIT = 10;

/** Consulta de CPF: o formulário consulta uma vez por CPF digitado. */
export const PUBLIC_LOOKUP_LIMIT = 20;

export const publicFormRateLimit = {
    rateLimit: { max: PUBLIC_FORM_LIMIT,
timeWindow: '1 minute',
errorResponseBuilder: tooManyRequests },
};

export const publicLookupRateLimit = {
    rateLimit: { max: PUBLIC_LOOKUP_LIMIT,
timeWindow: '1 minute',
errorResponseBuilder: tooManyRequests },
};
