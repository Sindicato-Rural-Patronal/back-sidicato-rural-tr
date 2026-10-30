/**
 * Financeiro: Nº dos lançamentos (SR-064, decisão 005) — E2E.
 *
 * Ida A: o `number` sai nas respostas (lista, criação, edição e transferência,
 * com null como null) e a migration de numeração numera os ativos em ordem de
 * data, deixa os excluídos sem número, mantém as duas pernas da transferência
 * juntas (saída antes da entrada) e, rodada de novo, continua do maior.
 */
import { readFileSync } from 'node:fs';
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
const FILL_SQL = readFileSync(
    new URL('../../prisma/migrations/20261030200100_finance_transaction_number_fill/migration.sql', import.meta.url),
    'utf8',
);

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

describe('o number nas respostas (ida A)', () => {
    beforeEach(async () => {
        await truncateFinance();
        await seedAccounts();
    });

    it('criar responde com o lançamento inteiro, number e os vazios como null', async () => {
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
        expect(t).toHaveProperty('number');
        expect(t.number).toBeNull();
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
        for (const t of body.transactions) expect(t).toHaveProperty('number');
    });
});

describe('migration de numeração (ida A)', () => {
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
