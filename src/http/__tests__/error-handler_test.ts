import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import '../../lib/zod-config.js';
import { apiErrorHandler, zodErrorMessage } from '../error-handler.js';

// SR-055: o que escapa do use case por entrada errada responde 400.

function run(error: unknown): {
    status: number;
    body: unknown;
} {
    const sent = {
        status: 0,
        body: undefined as unknown,
    };
    const reply = {
        status(code: number) {
            sent.status = code;
            return reply;
        },
        send(body: unknown) {
            sent.body = body;
            return reply;
        },
    };
    const request = {
        log: {
            error: vi.fn(),
            warn: vi.fn(),
        },
    };
    apiErrorHandler(error as never, request as never, reply as never);
    return sent;
}

function zodError(schema: z.ZodType, input: unknown): unknown {
    try {
        schema.parse(input);
    } catch (e) {
        return e;
    }
    throw new Error('o schema aceitou a entrada');
}

/** Erro do Prisma como chega com o driver adapter (P2039 + SQLSTATE do Postgres). */
function prismaDbError(code: string, sqlState: string) {
    return Object.assign(new Error('Database error'), {
        code,
        meta: {
            driverAdapterError: {
                name: 'DriverAdapterError',
                cause: {
                    originalCode: sqlState,
                    kind: 'postgres',
                },
            },
        },
    });
}

describe('apiErrorHandler — ZodError de um .parse', () => {
    it('400 com a mensagem do campo', () => {
        const error = zodError(z.object({ amountCents: z.number() }), { amountCents: 'abc' });
        const res = run(error);
        expect(res.status).toBe(400);
        expect((res.body as { error: string }).error).toMatch(/^Campo "amountCents": /);
    });

    it('mensagem que já cita o campo não repete', () => {
        const error = zodError(z.object({ name: z.string() }), {});
        expect(zodErrorMessage(error)).toBe('Informe o campo name.');
    });

    it('mensagem escrita no schema vale como está, com o campo', () => {
        const error = zodError(z.object({ description: z.string().min(1, 'Informe a descrição') }), { description: '' });
        expect(zodErrorMessage(error)).toBe('Campo "description": Informe a descrição');
    });

    it('erro que não é do Zod não conta', () => {
        expect(zodErrorMessage(new Error('x'))).toBeNull();
        expect(zodErrorMessage(null)).toBeNull();
    });
});

describe('apiErrorHandler — valor que o banco recusa', () => {
    it('inteiro fora do int4 (P2020) → 400', () => {
        const res = run(Object.assign(new Error('Value out of range'), { code: 'P2020' }));
        expect(res).toEqual({
            status: 400,
            body: { error: 'Número fora do limite permitido.' },
        });
    });

    it('data fora do intervalo do Postgres (P2039 com 22008/22009) → 400', () => {
        for (const state of ['22008', '22009', '22007']) {
            expect(run(prismaDbError('P2039', state))).toEqual({
                status: 400,
                body: { error: 'Data fora do intervalo aceito.' },
            });
        }
    });

    it('outro erro de valor (classe 22, ex.: caractere nulo no texto) → 400 "Valor inválido."', () => {
        expect(run(prismaDbError('P2039', '22021'))).toEqual({
            status: 400,
            body: { error: 'Valor inválido.' },
        });
    });

    it('erro do banco que não é de valor continua 500, sem detalhe', () => {
        expect(run(prismaDbError('P2039', '42P01'))).toEqual({
            status: 500,
            body: { error: 'Erro interno do servidor.' },
        });
        expect(run(new TypeError('x is undefined')).status).toBe(500);
    });

    it('unicidade e chave estrangeira continuam 409', () => {
        expect(run(Object.assign(new Error('u'), { code: 'P2002' })).status).toBe(409);
        expect(run(Object.assign(new Error('f'), { code: 'P2003' })).status).toBe(409);
    });

    it('erro com statusCode < 500 (JSON malformado) usa esse status e a mensagem', () => {
        expect(run(Object.assign(new Error('O corpo da requisição não é um JSON válido.'), { statusCode: 400 }))).toEqual({
            status: 400,
            body: { error: 'O corpo da requisição não é um JSON válido.' },
        });
    });
});
