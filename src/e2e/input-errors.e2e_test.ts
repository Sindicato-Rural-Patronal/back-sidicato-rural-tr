/**
 * Entrada errada responde 400 com a mensagem em português, e não 500 (SR-055,
 * B2 do planejamento) — E2E, um bloco por padrão corrigido:
 *
 * 1. JSON malformado no corpo (o parser não punha `statusCode`);
 * 2. inteiro fora do int4 do Postgres no corpo (`order`, centavos, lotação);
 * 3. `1e400` na query ou no corpo, que vira Infinity e passava como "integer";
 * 4. data que o JavaScript aceita e o Postgres não (ano 0, antes de 4713 a.C.):
 *    no Financeiro, recusada na entrada com a mensagem do campo; nas outras
 *    rotas, pela rede do apiErrorHandler (SQLSTATE 22xxx);
 * 5. texto com caractere nulo, que o Postgres recusa;
 * 6. `ZodError` de um `.parse` que escape (nenhuma rota usa hoje; o padrão é
 *    `safeParse`/`parseQuery`), conferido num app com o mesmo error handler.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { PrismaClient } from '../generated/prisma/client.js';
import { createTestApp } from './helpers/create-test-app.js';
import { createTestPrisma, cleanDatabase, seedSuperAdmin, loginAndGetToken, bearer } from './helpers/db.js';
import { apiErrorHandler } from '../http/error-handler.js';
import { AJV_CUSTOM_OPTIONS, parseJsonBody } from '../http/lib/request-parsing.js';

let app: FastifyInstance;
let prisma: PrismaClient;
let token: string;
let accountId: string;

const json = <T>(body: string) => JSON.parse(body) as T;
const errorOf = (body: string) => json<{ error: string }>(body).error;

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

function call(method: Method, url: string, payload?: object) {
    return app.inject({
        method,
        url,
        headers: bearer(token),
        payload,
    });
}

/** Corpo cru, para mandar o que `JSON.stringify` não produz (malformado, 1e400). */
function callRaw(method: Method, url: string, raw: string) {
    return app.inject({
        method,
        url,
        headers: {
            ...bearer(token),
            'content-type': 'application/json',
        },
        payload: raw,
    });
}

beforeAll(async () => {
    prisma = createTestPrisma();
    await cleanDatabase(prisma);
    await prisma.$executeRawUnsafe(`
        TRUNCATE TABLE
            "FinanceMonthlyClosing",
            "FinancialAttachment",
            "FinancialTransaction",
            "FinanceRecurringTransaction",
            "FinancialCategory",
            "FinancialAccount",
            "FinancePaymentMethod"
        RESTART IDENTITY CASCADE
    `);
    await seedSuperAdmin(prisma);
    app = await createTestApp(prisma);
    token = await loginAndGetToken(app);
    const account = await call('POST', '/admin/finance/accounts', { name: 'BANCO' });
    expect(account.statusCode, account.body).toBe(201);
    accountId = json<{ id: string }>(account.body).id;
});

afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
});

const transaction = {
    type: 'OUT',
    amountCents: 1000,
    date: '2026-10-01',
    description: 'LUZ',
};

describe('1. JSON malformado no corpo', () => {
    it.each([
        ['POST', '/admin/finance/transactions'],
        ['POST', '/admin/finance/transfers'],
        ['POST', '/admin/finance/closings'],
        ['POST', '/rules'],
        ['POST', '/contacts/message'],
    ] as const)('%s %s → 400', async (method, url) => {
        const res = await callRaw(method, url, '{"description": "LUZ",');
        expect(res.statusCode, res.body).toBe(400);
        expect(errorOf(res.body)).toBe('O corpo da requisição não é um JSON válido.');
    });

    it('nada é gravado', async () => {
        expect(await prisma.financialTransaction.count()).toBe(0);
    });

    it('corpo vazio com content-type JSON continua valendo {}', async () => {
        const res = await callRaw('POST', '/admin/finance/recurrences/generate', '');
        expect(res.statusCode, res.body).toBe(200);
    });
});

describe('2. inteiro fora do int4 no corpo', () => {
    it('valor do lançamento → 400 citando o campo, e nada é gravado', async () => {
        const res = await call('POST', '/admin/finance/transactions', {
            ...transaction,
            amountCents: 2147483648,
        });
        expect(res.statusCode, res.body).toBe(400);
        expect(errorOf(res.body)).toBe('Valor maior que o máximo em "amountCents": 2147483647.');
        expect(await prisma.financialTransaction.count()).toBe(0);
    });

    it('ordem da categoria e do caixa, na criação e na edição', async () => {
        const created = await call('POST', '/admin/finance/categories', {
            name: 'ALUGUEL',
            type: 'OUT',
            order: 99999999999,
        });
        expect(created.statusCode, created.body).toBe(400);
        expect(errorOf(created.body)).toContain('"order"');

        const edited = await call('PATCH', `/admin/finance/accounts/${accountId}`, { order: -2147483649 });
        expect(edited.statusCode, edited.body).toBe(400);
        expect(errorOf(edited.body)).toBe('Valor menor que o mínimo em "order": -2147483648.');
    });

    it('fora do Financeiro também (lotação da sala)', async () => {
        const res = await call('POST', '/rooms', {
            name: 'SALA 1',
            description: 'SALA',
            maxCapacity: 3000000000,
        });
        expect(res.statusCode, res.body).toBe(400);
        expect(errorOf(res.body)).toContain('"maxCapacity"');
    });

    it('no limite do int4 ainda passa', async () => {
        const res = await call('POST', '/admin/finance/transactions', {
            ...transaction,
            amountCents: 2147483647,
            accountId,
        });
        expect(res.statusCode, res.body).toBe(201);
    });
});

describe('3. "1e400" (Infinity) na query e no corpo', () => {
    it.each([
        '/admin/finance/transactions?page=1e400',
        '/admin/rules?page=1e400',
        '/rooms?limit=1e400',
        '/admin/audit-logs?limit=1e400',
    ])('%s → 400', async url => {
        const res = await call('GET', url);
        expect(res.statusCode, res.body).toBe(400);
        expect(errorOf(res.body)).toMatch(/^Valor maior que o máximo em "(page|limit)"/);
    });

    it('no corpo JSON → 400', async () => {
        const res = await callRaw('POST', '/admin/finance/transactions', '{"type":"OUT","amountCents":1e400,"date":"2026-10-01","description":"LUZ"}');
        expect(res.statusCode, res.body).toBe(400);
        expect(errorOf(res.body)).toContain('"amountCents"');
    });
});

describe('4. data que o Postgres não aceita', () => {
    it('lançamento e transferência: ano fora de 1900–2999 → 400 com a mensagem do campo', async () => {
        for (const date of ['0000-01-01', '-005000-01-01T00:00:00.000Z', '0202-10-30']) {
            const res = await call('POST', '/admin/finance/transactions', {
                ...transaction,
                date,
            });
            expect(res.statusCode, `${date}: ${res.body}`).toBe(400);
            expect(errorOf(res.body)).toBe('Data inválida: use um ano entre 1900 e 2999.');
        }
        const other = await call('POST', '/admin/finance/accounts', { name: 'COFRE' });
        const transfer = await call('POST', '/admin/finance/transfers', {
            fromAccountId: accountId,
            toAccountId: json<{ id: string }>(other.body).id,
            amountCents: 100,
            date: '0000-01-01',
        });
        expect(transfer.statusCode, transfer.body).toBe(400);
        expect(errorOf(transfer.body)).toBe('Data inválida: use um ano entre 1900 e 2999.');
    });

    it('editar lançamento com data assim → 400', async () => {
        const tx = await prisma.financialTransaction.findFirstOrThrow();
        const res = await call('PATCH', `/admin/finance/transactions/${tx.id}`, { date: '0000-01-01' });
        expect(res.statusCode, res.body).toBe(400);
    });

    it('filtros da lista, do CSV e do resumo → 400 "Parâmetro inválido"', async () => {
        for (const url of [
            '/admin/finance/transactions?from=0000-01-01',
            '/admin/finance/transactions/export?to=-005000-01-01',
            '/admin/finance/summary?from=0000-01-01',
        ]) {
            const res = await call('GET', url);
            expect(res.statusCode, `${url}: ${res.body}`).toBe(400);
            expect(errorOf(res.body)).toMatch(/^Parâmetro inválido: (from|to)$/);
        }
    });

    it('mês da recorrência e do fechamento com ano 0026 → 400 (antes quebrava a geração)', async () => {
        const rec = await call('POST', '/admin/finance/recurrences', {
            type: 'OUT',
            description: 'ALUGUEL',
            amountCents: 100,
            dayOfMonth: 10,
            startMonth: '0026-01',
        });
        expect(rec.statusCode, rec.body).toBe(400);
        expect(errorOf(rec.body)).toBe('Mês inválido (use AAAA-MM, com ano entre 1900 e 2999)');
        const closing = await call('POST', '/admin/finance/closings', {
            accountId,
            month: '0000-01',
            countedBalanceCents: 0,
        });
        expect(closing.statusCode, closing.body).toBe(400);
        const generate = await call('POST', '/admin/finance/recurrences/generate');
        expect(generate.statusCode, generate.body).toBe(200);
    });

    it('fora do Financeiro, a rede do error handler: filtro da auditoria → 400', async () => {
        const res = await call('GET', '/admin/audit-logs?from=0000-01-01');
        expect(res.statusCode, res.body).toBe(400);
        expect(errorOf(res.body)).toBe('Data fora do intervalo aceito.');
    });
});

describe('5. texto com caractere nulo', () => {
    it('nome da categoria com \\u0000 → 400 "Valor inválido."', async () => {
        const res = await call('POST', '/admin/finance/categories', {
            name: 'ALU\u0000GUEL',
            type: 'OUT',
        });
        expect(res.statusCode, res.body).toBe(400);
        expect(errorOf(res.body)).toBe('Valor inválido.');
    });
});

describe('6. ZodError de um .parse que escape', () => {
    let probe: FastifyInstance;

    beforeAll(async () => {
        // Mesmo parser, mesmas opções de Ajv e mesmo error handler do servidor.
        probe = fastify({
            logger: false,
            ajv: { customOptions: AJV_CUSTOM_OPTIONS },
        });
        probe.addContentTypeParser('application/json', { parseAs: 'string' }, parseJsonBody);
        probe.post('/parse', async request => {
            z.object({ amountCents: z.number().int().positive('O valor deve ser maior que zero') }).parse(request.body);
            return { ok: true };
        });
        probe.setErrorHandler(apiErrorHandler);
        await probe.ready();
    });

    afterAll(async () => {
        await probe?.close();
    });

    it('400 com a mensagem do campo em português', async () => {
        const res = await probe.inject({
            method: 'POST',
            url: '/parse',
            payload: { amountCents: 0 },
        });
        expect(res.statusCode, res.body).toBe(400);
        expect(errorOf(res.body)).toBe('Campo "amountCents": O valor deve ser maior que zero');

        const missing = await probe.inject({
            method: 'POST',
            url: '/parse',
            payload: {},
        });
        expect(missing.statusCode).toBe(400);
        expect(errorOf(missing.body)).toBe('Informe o campo amountCents.');
    });
});
