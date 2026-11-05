/**
 * Financeiro: Nº dos lançamentos (SR-064, decisão 005) — E2E.
 *
 * Ida A: o `number` sai nas respostas (lista, criação, edição e transferência,
 * com null como null) e a migration de numeração numera os ativos em ordem de
 * data, deixa os excluídos sem número, mantém as duas pernas da transferência
 * juntas (saída antes da entrada) e, rodada de novo, continua do maior.
 *
 * Ida B: o número automático (maior + 1, contando excluídos), o digitado
 * (buraco e salto), o 409 do número repetido (inclusive de excluído), a
 * transferência com dois números seguidos, a recorrência sem buraco, a correção
 * do Nº na edição com auditoria, dez criações ao mesmo tempo sem repetir, o
 * `next-number`, a busca, o `orderBy=number` e o CSV.
 */
import { readFileSync } from 'node:fs';
import { hash } from 'bcrypt';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '../generated/prisma/client.js';
import { createTestApp } from './helpers/create-test-app.js';
import { createTestPrisma, cleanDatabase, seedSuperAdmin, loginAndGetToken, bearer } from './helpers/db.js';

let app: FastifyInstance;
let prisma: PrismaClient;
let token: string;
let bancoId: string;
let cofreId: string;

const json = <T>(body: string) => JSON.parse(body) as T;

type Row = {
    id: string;
    number: number | null;
    type: 'IN' | 'OUT' | null;
    description: string;
    date: string;
    method: string | null;
    notes: string | null;
    categoryId: string | null;
    accountId: string | null;
    transferId: string | null;
    recurringId: string | null;
    recurringMonth: string | null;
    empenho: Record<string, unknown> | null;
    deletedAt: string | null;
    createdAt: string;
    updatedAt: string;
};

// A migration de numeração, do jeito que vai para a produção.
const migration = (name: string) =>
    readFileSync(new URL(`../../prisma/migrations/${name}/migration.sql`, import.meta.url), 'utf8');
const FILL_SQL = migration('20261030200100_finance_transaction_number_fill');
const FILL_AGAIN_SQL = migration('20261030210000_finance_transaction_number_fill_again');

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

function call(method: Method, url: string, payload?: object, auth = token) {
    return app.inject({
        method,
        url,
        headers: bearer(auth),
        payload,
    });
}

async function create(payload: Record<string, unknown> = {}): Promise<Row> {
    const res = await call('POST', '/admin/finance/transactions', {
        type: 'OUT',
        amountCents: 1000,
        date: '2026-05-10',
        description: 'LANCAMENTO',
        ...payload,
    });
    expect(res.statusCode, res.body).toBe(201);
    return json<Row>(res.body);
}

async function transfer(date = '2026-05-10'): Promise<Row[]> {
    const res = await call('POST', '/admin/finance/transfers', {
        fromAccountId: bancoId,
        toAccountId: cofreId,
        amountCents: 5000,
        date,
    });
    expect(res.statusCode, res.body).toBe(201);
    return json<{ transactions: Row[] }>(res.body).transactions;
}

async function nextNumber(): Promise<number> {
    const res = await call('GET', '/admin/finance/transactions/next-number');
    expect(res.statusCode, res.body).toBe(200);
    return json<{ next: number }>(res.body).next;
}

// Mês atual no fuso local: a geração das recorrências usa o mesmo relógio.
function currentMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function addMonths(month: string, n: number): string {
    const [y, m] = month.split('-').map(Number);
    const total = y * 12 + (m - 1) + n;
    return `${String(Math.floor(total / 12)).padStart(4, '0')}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** A linha da auditoria é gravada depois da resposta (onResponse): espera ela aparecer. */
async function waitForAudit(where: Record<string, unknown>) {
    for (let i = 0; i < 40; i++) {
        const row = await prisma.auditLog.findFirst({
            where,
            orderBy: { createdAt: 'desc' },
        });
        if (row) return row;
        await new Promise(r => setTimeout(r, 50));
    }
    throw new Error(`linha de auditoria não gravada: ${JSON.stringify(where)}`);
}

async function truncateFinance() {
    await prisma.$executeRawUnsafe(`
        TRUNCATE TABLE
            "FinanceMonthlyClosing", "FinancialAttachment", "FinancialTransaction",
            "FinanceRecurringTransaction", "FinancialCategory", "FinancialAccount", "FinancePaymentMethod"
        RESTART IDENTITY CASCADE
    `);
}

async function seedAccounts() {
    bancoId = (await prisma.financialAccount.create({ data: { name: 'BANCO' } })).id;
    cofreId = (await prisma.financialAccount.create({ data: { name: 'COFRE' } })).id;
}

beforeAll(async () => {
    prisma = createTestPrisma();
    await cleanDatabase(prisma);
    await truncateFinance();
    await seedSuperAdmin(prisma);
    app = await createTestApp(prisma);
    token = await loginAndGetToken(app);
});

afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
});

describe('o number nas respostas', () => {
    beforeEach(async () => {
        await truncateFinance();
        await seedAccounts();
    });

    it('criar responde com o lançamento inteiro, o number e os vazios como null', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/admin/finance/transactions',
            headers: bearer(token),
            payload: {
                type: 'OUT',
                amountCents: 1500,
                date: '2026-05-10',
                description: 'COMPRA',
                accountId: bancoId,
                empenho: { numero: '0045',
razaoSocial: 'FORNECEDOR' },
            },
        });
        expect(res.statusCode, res.body).toBe(201);
        const t = json<Row>(res.body);
        // Ida B: o primeiro lançamento do banco leva o 1.
        expect(t.number).toBe(1);
        expect(t.method).toBeNull();
        expect(t.notes).toBeNull();
        expect(t.categoryId).toBeNull();
        expect(t.transferId).toBeNull();
        expect(t.deletedAt).toBeNull();
        expect(t.accountId).toBe(bancoId);
        expect(t.date).toBe('2026-05-10T00:00:00.000Z');
        expect(t.empenho).toEqual({ numero: '0045',
razaoSocial: 'FORNECEDOR' });
    });

    it('a lista traz o number (null para quem ainda não tem, o número para quem tem)', async () => {
        const created = await prisma.financialTransaction.create({
            data: { type: 'IN',
amountCents: 100,
date: new Date('2026-05-01'),
description: 'COM NUMERO',
number: 7 },
        });
        await prisma.financialTransaction.create({
            data: { type: 'IN',
amountCents: 100,
date: new Date('2026-05-02'),
description: 'SEM NUMERO' },
        });
        const res = await app.inject({ method: 'GET',
url: '/admin/finance/transactions',
headers: bearer(token) });
        expect(res.statusCode, res.body).toBe(200);
        const rows = json<{
 data: (Row & {
 category: unknown;
account: unknown;
attachments: unknown[] 
})[] 
}>(res.body).data;
        const byDesc = Object.fromEntries(rows.map(r => [r.description, r]));
        expect(byDesc['COM NUMERO'].number).toBe(7);
        expect(byDesc['COM NUMERO'].id).toBe(created.id);
        expect(byDesc['SEM NUMERO']).toHaveProperty('number', null);
        // O que a lista acrescenta continua vindo.
        expect(byDesc['SEM NUMERO']).toHaveProperty('category', null);
        expect(byDesc['SEM NUMERO']).toHaveProperty('attachments', []);
    });

    it('editar responde com o lançamento como ficou', async () => {
        const t = await prisma.financialTransaction.create({
            data: { type: 'OUT',
amountCents: 100,
date: new Date('2026-05-01'),
description: 'ANTES',
number: 3 },
        });
        const res = await app.inject({
            method: 'PATCH',
            url: `/admin/finance/transactions/${t.id}`,
            headers: bearer(token),
            payload: { description: 'DEPOIS' },
        });
        expect(res.statusCode, res.body).toBe(200);
        const body = json<{
 message: string;
transaction: Row 
}>(res.body);
        expect(body.message).toBe('ok');
        expect(body.transaction.id).toBe(t.id);
        expect(body.transaction.description).toBe('DEPOIS');
        expect(body.transaction.number).toBe(3);
    });

    it('a transferência responde com as duas pernas, a saída primeiro', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/admin/finance/transfers',
            headers: bearer(token),
            payload: { fromAccountId: bancoId,
toAccountId: cofreId,
amountCents: 5000,
date: '2026-05-03' },
        });
        expect(res.statusCode, res.body).toBe(201);
        const body = json<{
 message: string;
transactions: Row[] 
}>(res.body);
        expect(body.message).toBe('ok');
        expect(body.transactions.map(t => [t.type, t.accountId])).toEqual([
            ['OUT', bancoId],
            ['IN', cofreId],
        ]);
        expect(body.transactions[0].transferId).toBe(body.transactions[1].transferId);
        expect(body.transactions.map(t => t.number)).toEqual([1, 2]);
    });
});

describe('migration de numeração (idas A e B)', () => {
    // Monta os lançamentos como estariam na produção antes da ida A.
    let seq = 0;
    async function row(data: {
        description: string;
        date: string;
        createdAt: string;
        type?: 'IN' | 'OUT' | null;
        transferId?: string;
        isDeleted?: boolean;
        number?: number;
        id?: string;
    }) {
        seq += 1;
        return prisma.financialTransaction.create({
            data: {
                id: data.id ?? `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
                type: data.type === undefined ? 'OUT' : data.type,
                amountCents: 100,
                date: new Date(`${data.date}T00:00:00.000Z`),
                description: data.description,
                createdAt: new Date(data.createdAt),
                transferId: data.transferId ?? null,
                isDeleted: data.isDeleted ?? false,
                deletedAt: data.isDeleted ? new Date() : null,
                number: data.number ?? null,
            },
        });
    }

    async function numbers(): Promise<Record<string, number | null>> {
        const rows = await prisma.financialTransaction.findMany({ select: { description: true,
number: true } });
        return Object.fromEntries(rows.map(r => [r.description, r.number]));
    }

    async function inOrder(): Promise<string[]> {
        const rows = await prisma.financialTransaction.findMany({
            where: { number: { not: null } },
            orderBy: { number: 'asc' },
            select: { description: true },
        });
        return rows.map(r => r.description);
    }

    beforeEach(async () => {
        await truncateFinance();
        seq = 0;
    });

    it('numera os ativos por data e createdAt, a partir de 1, e deixa os excluídos sem número', async () => {
        // Inseridos fora de ordem de propósito.
        await row({ description: 'C 03/05',
date: '2026-05-03',
createdAt: '2026-05-03T10:00:00.000Z' });
        await row({ description: 'A 01/05 lançado depois',
date: '2026-05-01',
createdAt: '2026-05-20T10:00:00.000Z' });
        await row({ description: 'B 02/05',
date: '2026-05-02',
createdAt: '2026-05-02T09:00:00.000Z' });
        await row({ description: 'A 01/05 lançado antes',
date: '2026-05-01',
createdAt: '2026-05-01T08:00:00.000Z' });
        await row({ description: 'EXCLUIDO',
date: '2026-04-01',
createdAt: '2026-04-01T08:00:00.000Z',
isDeleted: true });

        await prisma.$executeRawUnsafe(FILL_SQL);

        expect(await inOrder()).toEqual(['A 01/05 lançado antes', 'A 01/05 lançado depois', 'B 02/05', 'C 03/05']);
        expect((await numbers())['A 01/05 lançado antes']).toBe(1);
        expect((await numbers()).EXCLUIDO).toBeNull();
    });

    it('no empate de data e createdAt, saída e "só nota" antes da entrada, e por fim o id', async () => {
        const at = '2026-05-05T12:00:00.000Z';
        await row({ id: '00000000-0000-4000-8000-00000000000a',
description: 'ENTRADA id menor',
date: '2026-05-05',
createdAt: at,
type: 'IN' });
        await row({ id: '00000000-0000-4000-8000-00000000000c',
description: 'SAIDA id maior',
date: '2026-05-05',
createdAt: at,
type: 'OUT' });
        await row({ id: '00000000-0000-4000-8000-00000000000b',
description: 'SO NOTA id do meio',
date: '2026-05-05',
createdAt: at,
type: null });

        await prisma.$executeRawUnsafe(FILL_SQL);

        expect(await inOrder()).toEqual(['SO NOTA id do meio', 'SAIDA id maior', 'ENTRADA id menor']);
    });

    it('transferência: as duas pernas ficam juntas e em seguida, saída antes da entrada', async () => {
        // O Prisma grava a entrada alguns milissegundos depois da saída. Um
        // lançamento do mesmo dia gravado nesse intervalo não pode cair entre elas.
        const t1 = '11111111-0000-4000-8000-000000000001';
        await row({ description: 'T1 SAIDA',
date: '2026-05-06',
createdAt: '2026-05-06T12:00:00.000Z',
type: 'OUT',
transferId: t1,
id: '00000000-0000-4000-8000-0000000000f1' });
        await row({ description: 'T1 ENTRADA',
date: '2026-05-06',
createdAt: '2026-05-06T12:00:00.004Z',
type: 'IN',
transferId: t1,
id: '00000000-0000-4000-8000-0000000000e1' });
        await row({ description: 'NO MEIO DA T1',
date: '2026-05-06',
createdAt: '2026-05-06T12:00:00.002Z',
type: 'OUT' });

        // Duas transferências e uma "só nota" com a mesma data e o mesmo createdAt.
        const at = '2026-05-07T09:00:00.000Z';
        const t2 = '22222222-0000-4000-8000-000000000002';
        const t3 = '33333333-0000-4000-8000-000000000003';
        await row({ description: 'T3 ENTRADA',
date: '2026-05-07',
createdAt: at,
type: 'IN',
transferId: t3,
id: '00000000-0000-4000-8000-000000000001' });
        await row({ description: 'T2 ENTRADA',
date: '2026-05-07',
createdAt: at,
type: 'IN',
transferId: t2 });
        await row({ description: 'T2 SAIDA',
date: '2026-05-07',
createdAt: at,
type: 'OUT',
transferId: t2 });
        await row({ description: 'T3 SAIDA',
date: '2026-05-07',
createdAt: at,
type: 'OUT',
transferId: t3 });
        await row({ description: 'SO NOTA EMPATADA',
date: '2026-05-07',
createdAt: at,
type: null,
id: '2fffffff-0000-4000-8000-000000000000' });

        await prisma.$executeRawUnsafe(FILL_SQL);

        expect(await inOrder()).toEqual([
            'T1 SAIDA', 'T1 ENTRADA', 'NO MEIO DA T1',
            'T2 SAIDA', 'T2 ENTRADA', 'SO NOTA EMPATADA', 'T3 SAIDA', 'T3 ENTRADA',
        ]);
    });

    it('rodada de novo, numera só quem está sem número e continua do maior (excluídos contam)', async () => {
        await row({ description: 'JA TINHA',
date: '2026-05-01',
createdAt: '2026-05-01T08:00:00.000Z',
number: 1 });
        await row({ description: 'EXCLUIDO COM NUMERO',
date: '2026-05-02',
createdAt: '2026-05-02T08:00:00.000Z',
number: 50,
isDeleted: true });
        await row({ description: 'NOVO ANTIGO',
date: '2026-01-01',
createdAt: '2026-01-01T08:00:00.000Z' });
        await row({ description: 'NOVO RECENTE',
date: '2026-06-01',
createdAt: '2026-06-01T08:00:00.000Z' });

        await prisma.$executeRawUnsafe(FILL_SQL);
        const first = await numbers();
        expect(first).toEqual({
            'JA TINHA': 1,
            'EXCLUIDO COM NUMERO': 50,
            'NOVO ANTIGO': 51,
            'NOVO RECENTE': 52,
        });

        // Sem ninguém novo, não muda nada.
        await prisma.$executeRawUnsafe(FILL_SQL);
        expect(await numbers()).toEqual(first);
    });

    it('a ida B roda a mesma numeração de novo (mesma consulta)', () => {
        // Tira os comentários e os espaços: o SQL tem de ser o mesmo.
        const sql = (text: string) => text.replace(/--.*$/gm, '').replace(/\s+/g, ' ').trim();
        expect(sql(FILL_AGAIN_SQL)).toBe(sql(FILL_SQL));
    });

    it('numera quem foi criado entre as idas, continuando do maior', async () => {
        await row({ description: 'DA IDA A',
date: '2026-05-01',
createdAt: '2026-05-01T08:00:00.000Z',
number: 1 });
        await row({ description: 'ENTRE AS IDAS',
date: '2026-04-01',
createdAt: '2026-05-02T08:00:00.000Z' });
        await prisma.$executeRawUnsafe(FILL_AGAIN_SQL);
        expect(await numbers()).toEqual({ 'DA IDA A': 1,
'ENTRE AS IDAS': 2 });
    });

    it('não toca em nenhuma outra coluna', async () => {
        const before = await row({ description: 'INTOCADO',
date: '2026-05-01',
createdAt: '2026-05-01T08:00:00.000Z' });
        await prisma.$executeRawUnsafe(FILL_SQL);
        const after = await prisma.financialTransaction.findUniqueOrThrow({ where: { id: before.id } });
        expect({ ...after,
number: null }).toEqual({ ...before,
number: null });
        expect(after.number).toBe(1);
    });
});

describe('número automático e digitado (ida B)', () => {
    beforeEach(async () => {
        await truncateFinance();
        await seedAccounts();
    });

    it('automático: o maior + 1, começando em 1; next-number diz o próximo', async () => {
        expect(await nextNumber()).toBe(1);
        expect((await create()).number).toBe(1);
        expect((await create()).number).toBe(2);
        expect(await nextNumber()).toBe(3);
    });

    it('salto: o digitado à frente faz a sequência continuar dele', async () => {
        await create();
        expect((await create({ number: 5000 })).number).toBe(5000);
        expect(await nextNumber()).toBe(5001);
        expect((await create()).number).toBe(5001);
    });

    it('buraco: o digitado atrás é aceito e a sequência não muda', async () => {
        await create({ number: 100 });
        expect((await create({ number: 7 })).number).toBe(7);
        expect(await nextNumber()).toBe(101);
        expect((await create()).number).toBe(101);
    });

    it('excluído conta: o número dele não volta, nem no automático', async () => {
        const t = await create();
        expect((await call('DELETE', `/admin/finance/transactions/${t.id}`)).statusCode).toBe(204);
        expect(await nextNumber()).toBe(2);
        expect((await create()).number).toBe(2);
    });

    it('"Repetir" é um POST comum: ganha o próximo automático, mesmo com o mesmo empenho', async () => {
        const original = await create({ empenho: { numero: '77' } });
        const copia = await create({ empenho: { numero: '77' } });
        expect(copia.number).toBe(original.number! + 1);
    });
});

describe('número repetido → 409 (ida B)', () => {
    beforeEach(async () => {
        await truncateFinance();
        await seedAccounts();
    });

    it('criar com o número de outro lançamento: 409 e nada gravado', async () => {
        await create({ number: 123 });
        const before = await prisma.financialTransaction.count();
        const res = await call('POST', '/admin/finance/transactions', {
            type: 'IN',
            amountCents: 500,
            date: '2026-05-11',
            description: 'REPETIDO',
            number: 123,
        });
        expect(res.statusCode).toBe(409);
        expect(json<{ error: string }>(res.body)).toEqual({ error: 'O número 123 já é de outro lançamento.' });
        expect(await prisma.financialTransaction.count()).toBe(before);
    });

    it('criar com o número de um lançamento excluído: 409 que diz isso', async () => {
        const t = await create({ number: 9 });
        await call('DELETE', `/admin/finance/transactions/${t.id}`);
        const res = await call('POST', '/admin/finance/transactions', {
            type: 'OUT',
            amountCents: 500,
            date: '2026-05-11',
            description: 'NUMERO DE EXCLUIDO',
            number: 9,
        });
        expect(res.statusCode).toBe(409);
        expect(json<{ error: string }>(res.body).error).toBe('O número 9 já é de um lançamento excluído.');
    });

    it('editar para o número de outro: 409 e o lançamento não muda', async () => {
        const a = await create({ description: 'A' });
        const b = await create({ description: 'B' });
        const res = await call('PATCH', `/admin/finance/transactions/${b.id}`, {
            number: a.number,
            description: 'B MUDADO',
        });
        expect(res.statusCode).toBe(409);
        expect(json<{ error: string }>(res.body).error).toBe(`O número ${a.number} já é de outro lançamento.`);
        const after = await prisma.financialTransaction.findUniqueOrThrow({ where: { id: b.id } });
        expect(after.number).toBe(b.number);
        expect(after.description).toBe('B');
    });

    it('editar mantendo o próprio número não é conflito', async () => {
        const a = await create();
        const res = await call('PATCH', `/admin/finance/transactions/${a.id}`, {
            number: a.number,
            description: 'MESMO NUMERO',
        });
        expect(res.statusCode, res.body).toBe(200);
        expect(json<{ transaction: Row }>(res.body).transaction.number).toBe(a.number);
    });

    it.each([
        ['null', null],
        ['zero', 0],
        ['negativo', -3],
        ['fracionado', 2.5],
        ['texto', 'abc'],
        ['acima do int4', 2147483648],
    ])('número %s → 400', async (_caso, value) => {
        const a = await create();
        const post = await call('POST', '/admin/finance/transactions', {
            type: 'OUT',
            amountCents: 100,
            date: '2026-05-10',
            description: 'X',
            number: value,
        });
        expect(post.statusCode, post.body).toBe(400);
        const patch = await call('PATCH', `/admin/finance/transactions/${a.id}`, { number: value });
        expect(patch.statusCode, patch.body).toBe(400);
        expect((await prisma.financialTransaction.findUniqueOrThrow({ where: { id: a.id } })).number).toBe(a.number);
    });
});

describe('transferência e recorrência (ida B)', () => {
    beforeEach(async () => {
        await truncateFinance();
        await seedAccounts();
    });

    it('transferência: dois números seguidos, a saída com o menor', async () => {
        await create();
        const [out, into] = await transfer();
        expect(out.type).toBe('OUT');
        expect(into.type).toBe('IN');
        expect([out.number, into.number]).toEqual([2, 3]);
        expect(await nextNumber()).toBe(4);
    });

    it('transferência ignora number no corpo: é sempre automática', async () => {
        const res = await call('POST', '/admin/finance/transfers', {
            fromAccountId: bancoId,
            toAccountId: cofreId,
            amountCents: 5000,
            date: '2026-05-10',
            number: 900,
        });
        expect(res.statusCode, res.body).toBe(201);
        expect(json<{ transactions: Row[] }>(res.body).transactions.map(t => t.number)).toEqual([1, 2]);
    });

    it('recorrência: cada mês ganha o próximo número; mês já gerado não gasta número', async () => {
        const now = currentMonth();
        const created = await call('POST', '/admin/finance/recurrences', {
            type: 'OUT',
            description: 'ALUGUEL',
            amountCents: 100000,
            dayOfMonth: 5,
            startMonth: addMonths(now, -2),
        });
        expect(created.statusCode, created.body).toBe(201);
        const recurringId = json<{ id: string }>(created.body).id;
        await create({ description: 'ANTES' });

        // O mês do meio já existe (gerado antes, com número): a geração bate no
        // índice (recurringId, recurringMonth), segue para o próximo mês e não
        // deixa buraco na sequência.
        await prisma.financialTransaction.create({
            data: {
                number: 2,
                recurringId,
                recurringMonth: addMonths(now, -1),
                type: 'OUT',
                amountCents: 100000,
                date: new Date(`${addMonths(now, -1)}-05T00:00:00.000Z`),
                description: 'ALUGUEL',
            },
        });

        const gen = await call('POST', '/admin/finance/recurrences/generate');
        expect(gen.statusCode, gen.body).toBe(200);
        expect(json<{ created: number }>(gen.body).created).toBe(2);
        const rows = await prisma.financialTransaction.findMany({
            where: { recurringId },
            orderBy: { recurringMonth: 'asc' },
            select: { recurringMonth: true,
number: true },
        });
        expect(rows).toEqual([
            { recurringMonth: addMonths(now, -2),
number: 3 },
            { recurringMonth: addMonths(now, -1),
number: 2 },
            { recurringMonth: now,
number: 4 },
        ]);

        // Rodar de novo não cria nada e não gasta número.
        const again = await call('POST', '/admin/finance/recurrences/generate');
        expect(json<{ created: number }>(again.body).created).toBe(0);
        expect(await nextNumber()).toBe(5);
    });

    it('recorrência: colisão no Nº não é "mês já gerado" e não é engolida', async () => {
        // A trava impede a colisão; para provocá-la, um gatilho de teste grava
        // outro lançamento com o mesmo número logo antes do insert da geração,
        // como se outro processo tivesse gravado fora da trava.
        const now = currentMonth();
        const created = await call('POST', '/admin/finance/recurrences', {
            type: 'IN',
            description: 'MENSALIDADE',
            amountCents: 5000,
            dayOfMonth: 1,
            startMonth: now,
        });
        expect(created.statusCode, created.body).toBe(201);
        const recurringId = json<{ id: string }>(created.body).id;
        await prisma.$executeRawUnsafe(`
            CREATE OR REPLACE FUNCTION e2e_numero_colide() RETURNS trigger AS $$
            BEGIN
                INSERT INTO "FinancialTransaction" (id, number, "amountCents", date, description, "updatedAt")
                VALUES (gen_random_uuid()::text, NEW.number, 1, now(), 'INTRUSO', now());
                RETURN NEW;
            END $$ LANGUAGE plpgsql`);
        await prisma.$executeRawUnsafe(`
            CREATE TRIGGER e2e_numero_colide BEFORE INSERT ON "FinancialTransaction"
            FOR EACH ROW WHEN (NEW."recurringId" IS NOT NULL)
            EXECUTE FUNCTION e2e_numero_colide()`);
        try {
            const gen = await call('POST', '/admin/finance/recurrences/generate');
            // Antes, todo P2002 virava "mês já gerado": created 0, sem erro nenhum.
            // Agora o erro sobe (409 do apiErrorHandler) e nada fica gravado.
            expect(gen.statusCode).toBe(409);
            expect(await prisma.financialTransaction.count({ where: { recurringId } })).toBe(0);
        } finally {
            await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS e2e_numero_colide ON "FinancialTransaction"');
            await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS e2e_numero_colide()');
        }
    });
});

describe('dez criações ao mesmo tempo (ida B)', () => {
    beforeEach(async () => {
        await truncateFinance();
        await seedAccounts();
    });

    it('dez lançamentos gravados juntos: dez números diferentes e seguidos', async () => {
        await create({ number: 40 });
        const results = await Promise.all(
            Array.from({ length: 10 }, (_v, i) => call('POST', '/admin/finance/transactions', {
                type: i % 2 ? 'IN' : 'OUT',
                amountCents: 100 + i,
                date: '2026-05-12',
                description: `PARALELO ${i}`,
            })),
        );
        for (const r of results) expect(r.statusCode, r.body).toBe(201);
        const numbers = results.map(r => json<Row>(r.body).number!).sort((a, b) => a - b);
        expect(numbers).toEqual([41, 42, 43, 44, 45, 46, 47, 48, 49, 50]);
    });

    it('lançamentos e transferências juntos: nada repete, e cada transferência fica com dois seguidos', async () => {
        const calls = [
            ...Array.from({ length: 6 }, (_v, i) => call('POST', '/admin/finance/transactions', {
                type: 'OUT',
                amountCents: 100,
                date: '2026-05-12',
                description: `MISTO ${i}`,
            })),
            ...Array.from({ length: 3 }, () => call('POST', '/admin/finance/transfers', {
                fromAccountId: bancoId,
                toAccountId: cofreId,
                amountCents: 100,
                date: '2026-05-12',
            })),
        ];
        const results = await Promise.all(calls);
        for (const r of results) expect(r.statusCode, r.body).toBe(201);
        const all = await prisma.financialTransaction.findMany({
            select: { number: true,
transferId: true,
type: true },
        });
        const numbers = all.map(t => t.number!).sort((a, b) => a - b);
        expect(numbers).toEqual(Array.from({ length: 12 }, (_v, i) => i + 1));
        const byTransfer = new Map<string, Partial<Record<'OUT' | 'IN', number>>>();
        for (const t of all.filter(x => x.transferId)) {
            const legs = byTransfer.get(t.transferId!) ?? {};
            legs[t.type as 'OUT' | 'IN'] = t.number!;
            byTransfer.set(t.transferId!, legs);
        }
        expect(byTransfer.size).toBe(3);
        for (const legs of byTransfer.values()) expect(legs.IN).toBe(legs.OUT! + 1);
    });
});

describe('edição do Nº na auditoria (ida B)', () => {
    beforeEach(async () => {
        await truncateFinance();
        await seedAccounts();
        await prisma.auditLog.deleteMany({});
    });

    it('corrigir o Nº fica na trilha: título com o Nº de depois, "(antes nº 1)", e o antes e depois', async () => {
        const t = await create({ description: 'COMPRA DE ADUBO' });
        const res = await call('PATCH', `/admin/finance/transactions/${t.id}`, { number: 15 });
        expect(res.statusCode, res.body).toBe(200);
        expect(json<{ transaction: Row }>(res.body).transaction.number).toBe(15);

        const log = await waitForAudit({
            method: 'PATCH',
            entity: 'Lançamento',
        });
        expect(log.targetLabel).toBe('nº 15 (antes nº 1) — COMPRA DE ADUBO');
        expect(log.changes).toEqual(expect.arrayContaining([{
            field: 'number',
            before: 1,
            after: 15,
        }]));

        const list = await call('GET', `/admin/audit-logs?entity=${encodeURIComponent('Lançamento')}`);
        const summaries = json<{ data: { summary: string }[] }>(list.body).data.map(r => r.summary);
        expect(summaries).toContain('Editou o lançamento "nº 15 (antes nº 1) — COMPRA DE ADUBO"');
    });

    it('editar só a descrição: título com a descrição nova e o mesmo Nº, sem "antes"', async () => {
        const t = await create({ description: 'COMPRA DE ADUBO' });
        const res = await call('PATCH', `/admin/finance/transactions/${t.id}`, { description: 'COMPRA DE SEMENTE' });
        expect(res.statusCode, res.body).toBe(200);
        const log = await waitForAudit({ method: 'PATCH',
entity: 'Lançamento' });
        expect(log.targetLabel).toBe('nº 1 — COMPRA DE SEMENTE');
    });

    it('criar cita o número, o automático e o digitado (SR-069)', async () => {
        const auto = await create({ description: 'COMPRA DE ADUBO' });
        const typed = await create({ number: 5000,
description: 'LUZ' });
        expect([auto.number, typed.number]).toEqual([1, 5000]);

        const log = await waitForAudit({
            method: 'POST',
            entity: 'Lançamento',
            targetLabel: 'nº 5000 — LUZ',
        });
        expect(log.statusCode).toBe(201);
        await waitForAudit({
            method: 'POST',
            entity: 'Lançamento',
            targetLabel: 'nº 1 — COMPRA DE ADUBO',
        });

        const list = await call('GET', `/admin/audit-logs?entity=${encodeURIComponent('Lançamento')}`);
        const summaries = json<{ data: { summary: string }[] }>(list.body).data.map(r => r.summary);
        expect(summaries).toContain('Criou o lançamento "nº 1 — COMPRA DE ADUBO"');
        expect(summaries).toContain('Criou o lançamento "nº 5000 — LUZ"');
    });

    it('criar que a regra recusa não deixa linha na trilha', async () => {
        await create({ number: 7,
description: 'PRIMEIRO' });
        await waitForAudit({ method: 'POST',
entity: 'Lançamento',
targetLabel: 'nº 7 — PRIMEIRO' });
        const again = await call('POST', '/admin/finance/transactions', { type: 'OUT',
amountCents: 1000,
date: '2026-05-10',
description: 'REPETIDO',
number: 7 });
        expect(again.statusCode, again.body).toBe(409);
        await new Promise(r => setTimeout(r, 300));
        expect(await prisma.auditLog.count({ where: { entity: 'Lançamento',
targetLabel: { contains: 'REPETIDO' } } })).toBe(0);
    });

    it('excluir não mexe no número, e a trilha cita o número', async () => {
        const t = await create({ description: 'LUZ' });
        expect((await call('DELETE', `/admin/finance/transactions/${t.id}`)).statusCode).toBe(204);
        const log = await waitForAudit({
            method: 'DELETE',
            entity: 'Lançamento',
        });
        expect(log.targetLabel).toBe('nº 1 — LUZ');
        expect((await prisma.financialTransaction.findUniqueOrThrow({ where: { id: t.id } })).number).toBe(1);
    });
});

describe('busca, ordem, CSV e next-number (ida B)', () => {
    beforeAll(async () => {
        await truncateFinance();
        await seedAccounts();
        await create({ number: 45,
description: 'ALFA' });
        await create({ description: 'BETA',
empenho: { numero: '0045' } });
        await create({ description: 'GAMA',
empenho: { numero: '1450' } });
        await create({ description: 'PARCELA 45 DE 60' });
        await create({ description: 'EPSILON',
empenho: { numero: 'NE-2024/7',
cnpjCpf: '12.345.678/0001-90' } });
        await create({ number: 450,
description: 'ZETA' });
    });

    async function search(term: string): Promise<string[]> {
        const res = await call('GET', `/admin/finance/transactions?search=${encodeURIComponent(term)}`);
        expect(res.statusCode, res.body).toBe(200);
        return json<{ data: Row[] }>(res.body).data.map(t => t.description).sort();
    }

    it('termo só de dígitos: Nº igual, "Nº anterior" igual sem os zeros à esquerda, descrição que contém', async () => {
        // BETA é o nº 46, GAMA o 47, PARCELA o 48, EPSILON o 49.
        expect(await search('45')).toEqual(['ALFA', 'BETA', 'PARCELA 45 DE 60']);
        expect(await search('0045')).toEqual(['ALFA', 'BETA']);
        expect(await search('1450')).toEqual(['GAMA']);
        expect(await search('450')).toEqual(['ZETA']);
        expect(await search(' 46 ')).toEqual(['BETA']);
        expect(await search('9999')).toEqual([]);
    });

    it('outro termo: descrição ou "Nº anterior" que contém', async () => {
        expect(await search('ne-2024')).toEqual(['EPSILON']);
        expect(await search('parcela')).toEqual(['PARCELA 45 DE 60']);
    });

    it('a busca pelo CNPJ/CPF do fornecedor continua (SR-056)', async () => {
        expect(await search('12.345.678')).toEqual(['EPSILON']);
    });

    it('orderBy=number: do maior para o menor; valor desconhecido → 400', async () => {
        const byNumber = await call('GET', '/admin/finance/transactions?orderBy=number');
        expect(byNumber.statusCode, byNumber.body).toBe(200);
        expect(json<{ data: Row[] }>(byNumber.body).data.map(t => t.number)).toEqual([450, 49, 48, 47, 46, 45]);
        const byDate = await call('GET', '/admin/finance/transactions?orderBy=date');
        expect(byDate.statusCode, byDate.body).toBe(200);
        const invalid = await call('GET', '/admin/finance/transactions?orderBy=valor');
        expect(invalid.statusCode).toBe(400);
    });

    it('CSV: "Nº" primeiro, "Nº anterior" depois do CNPJ / CPF, na ordem pedida', async () => {
        const res = await call('GET', '/admin/finance/transactions/export?orderBy=number');
        expect(res.statusCode, res.body).toBe(200);
        const lines = res.body
            .replace(/^﻿/, '')
            .trim()
            .split('\r\n')
            .map(l => l.slice(1, -1).split('";"'));
        const header = lines[0];
        expect(header[0]).toBe('Nº');
        expect(header.indexOf('Nº anterior')).toBe(header.indexOf('CNPJ / CPF') + 1);
        expect(lines.slice(1).map(l => l[0])).toEqual(['450', '49', '48', '47', '46', '45']);
        const epsilon = lines.find(l => l.includes('EPSILON'))!;
        expect(epsilon[header.indexOf('Nº anterior')]).toBe('NE-2024/7');
    });

    it('next-number: o maior + 1; sem login 401, sem READ_FINANCE 403', async () => {
        expect(await nextNumber()).toBe(451);
        const rule = await prisma.rule.create({
            data: { name: 'SEM FINANCEIRO',
description: 'E2E',
permissions: ['READ_USER'] },
        });
        const person = await prisma.userData.create({ data: { name: 'Sem Financeiro',
phone: '44910009999' } });
        await prisma.userAdmin.create({
            data: {
                username: 'semfinanceiro',
                passwordHash: await hash('semFinanceiro123!', 4),
                userDataId: person.id,
                rulesId: rule.id,
            },
        });
        const other = await loginAndGetToken(app, 'semfinanceiro', 'semFinanceiro123!');
        const forbidden = await call('GET', '/admin/finance/transactions/next-number', undefined, other);
        expect(forbidden.statusCode).toBe(403);
        const anonymous = await app.inject({
            method: 'GET',
            url: '/admin/finance/transactions/next-number',
        });
        expect(anonymous.statusCode).toBe(401);
    });
});
