import type { ZodType } from 'zod';

export class ValidationError extends Error {
    // Quando é lançado (em vez de devolvido em `{ error }`), o apiErrorHandler
    // usa o statusCode: responde 400 com a mensagem, e não 500.
    readonly statusCode = 400;

    constructor(message: string) {
        super(message);
        this.name = 'ValidationError';
    }
}

/**
 * `schema.parse` para filtros de consulta: o `ZodError` do `.parse` não tem
 * `statusCode` e virava 500 ("?from=ontem" no financeiro). Aqui o erro sai
 * como ValidationError, que o apiErrorHandler responde com 400.
 */
export function parseQuery<T>(schema: ZodType<T>, query: unknown): T {
    const parsed = schema.safeParse(query ?? {});
    if (parsed.success) return parsed.data;
    const issue = parsed.error.issues[0];
    const field = issue?.path.join('.');
    throw new ValidationError(field ? `Parâmetro inválido: ${field}` : 'Parâmetros inválidos');
}
