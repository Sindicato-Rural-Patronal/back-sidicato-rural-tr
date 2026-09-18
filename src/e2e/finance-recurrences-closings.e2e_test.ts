/**
 * Financeiro: recorrentes, formas de pagamento e fechamento mensal — E2E.
 *
 * Cobre: CRUD de recorrência, geração idempotente (rodar duas vezes não
 * duplica), mês curto (dia 31 em fevereiro), mês final, excluir recorrência sem
 * perder os lançamentos já gerados; lista/criação de forma de pagamento (nome
 * normalizado, repetido → 409) e filtro por forma na listagem e no CSV;
 * fechamento mensal (esperado recalculado no servidor, diferença, repetido →
 * 409, reabrir) e 403 sem permissão de Financeiro.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { hash } from 'bcrypt';
import type { PrismaClient } from '../generated/prisma/client.js';
import { createTestApp } from './helpers/create-test-app.js';
import { createTestPrisma, cleanDatabase, seedSuperAdmin, loginAndGetToken, bearer } from './helpers/db.js';

let app: FastifyInstance;
let prisma: PrismaClient;
let token: string;
let noFinanceToken: string;
let accountId: string;
let otherAccountId: string;
let categoryId: string;

const json = <T>(body: string) => JSON.parse(body) as T;

// Mês atual no fuso local — a geração usa o mesmo relógio do servidor.
function currentMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function addMonths(month: string, n: number): string {
    const [y, m] = month.split('-').map(Number);
    const total = y * 12 + (m - 1) + n;
    return `${String(Math.floor(total / 12)).padStart(4, '0')}-${String((total % 12) + 1).padStart(2, '0')}`;
}

beforeAll(async () => {
    prisma = createTestPrisma();
    await cleanDatabase(prisma);
    // O helper compartilhado não limpa o Financeiro — aqui a gente limpa.
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

    // Admin sem nenhuma permissão de Financeiro.
    const rule = await prisma.rule.create({
        data: { name: 'SEM_FINANCEIRO',
description: 'E2E',
permissions: ['READ_COURSE'] },
    });
    const person = await prisma.userData.create({ data: { name: 'Sem Financeiro',
phone: '44900000011' } });
    await prisma.userAdmin.create({
        data: {
            username: 'semfinanceiro',
            passwordHash: await hash('semFinPass123!', 4),
            userDataId: person.id,
            rulesId: rule.id,
        },
    });
    noFinanceToken = await loginAndGetToken(app, 'semfinanceiro', 'semFinPass123!');

    const acc = await app.inject({
        method: 'POST',
        url: '/admin/finance/accounts',
        headers: bearer(token),
        payload: { name: 'CAIXA GERAL' },
    });
    expect(acc.statusCode, acc.body).toBe(201);
    accountId = json<{ id: string }>(acc.body).id;

    const other = await app.inject({
        method: 'POST',
        url: '/admin/finance/accounts',
        headers: bearer(token),
        payload: { name: 'BANCO' },
    });
    otherAccountId = json<{ id: string }>(other.body).id;

    const cat = await app.inject({
        method: 'POST',
        url: '/admin/finance/categories',
        headers: bearer(token),
        payload: { name: 'ALUGUEL',
type: 'OUT' },
    });
    categoryId = json<{ id: string }>(cat.body).id;
});

afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
});

describe('Recorrentes', () => {
    it('cria, gera os meses que faltam e não repete na segunda rodada', async () => {
        const start = addMonths(currentMonth(), -2);
        const created = await app.inject({
            method: 'POST',
            url: '/admin/finance/recurrences',
            headers: bearer(token),
            payload: {
                type: 'OUT',
                description: 'ALUGUEL DA SEDE',
                amountCents: 250000,
                dayOfMonth: 10,
                startMonth: start,
                categoryId,
                accountId,
                paymentMethod: 'PIX',
            },
        });
        expect(created.statusCode, created.body).toBe(201);
        const recId = json<{ id: string }>(created.body).id;

        const first = await app.inject({
            method: 'POST',
            url: '/admin/finance/recurrences/generate',
            headers: bearer(token),
        });
        expect(first.statusCode, first.body).toBe(200);
        // 2 meses atrás, mês passado e o atual.
        expect(json<{ created: number }>(first.body).created).toBe(3);

        // Idempotência: a segunda rodada não cria nada.
        const second = await app.inject({
            method: 'POST',
            url: '/admin/finance/recurrences/generate',
            headers: bearer(token),
        });
        expect(json<{ created: number }>(second.body).created).toBe(0);

        const rows = await prisma.financialTransaction.findMany({ where: { recurringId: recId } });
        expect(rows).toHaveLength(3);
        expect(rows.every(r => r.amountCents === 250000 && r.type === 'OUT')).toBe(true);
        expect(rows.every(r => r.method === 'PIX' && r.accountId === accountId)).toBe(true);
        // O mês vem marcado no lançamento (base do unique que trava a repetição).
        expect(new Set(rows.map(r => r.recurringMonth)).size).toBe(3);
    });

    it('mês curto usa o último dia (dia 31 em fevereiro)', async () => {
        const created = await app.inject({
            method: 'POST',
            url: '/admin/finance/recurrences',
            headers: bearer(token),
            payload: {
                type: 'IN',
                description: 'MENSALIDADE',
                amountCents: 10000,
                dayOfMonth: 31,
                startMonth: '2026-02',
                endMonth: '2026-02',
                accountId,
            },
        });
        const recId = json<{ id: string }>(created.body).id;

        await app.inject({ method: 'POST',
url: '/admin/finance/recurrences/generate',
headers: bearer(token) });

        const rows = await prisma.financialTransaction.findMany({ where: { recurringId: recId } });
        expect(rows).toHaveLength(1);
        expect(rows[0].date.toISOString().slice(0, 10)).toBe('2026-02-28');
        // Mês final alcançado: novas rodadas não geram mais nada.
        const again = await app.inject({
            method: 'POST',
            url: '/admin/finance/recurrences/generate',
            headers: bearer(token),
        });
        expect(json<{ created: number }>(again.body).created).toBe(0);
    });

    it('recusa dia inválido e mês final antes do inicial', async () => {
        const badDay = await app.inject({
            method: 'POST',
            url: '/admin/finance/recurrences',
            headers: bearer(token),
            payload: { type: 'OUT',
description: 'X',
amountCents: 100,
dayOfMonth: 32,
startMonth: '2026-01' },
        });
        expect(badDay.statusCode).toBe(400);

        const badRange = await app.inject({
            method: 'POST',
            url: '/admin/finance/recurrences',
            headers: bearer(token),
            payload: { type: 'OUT',
description: 'X',
amountCents: 100,
dayOfMonth: 1,
startMonth: '2026-05',
endMonth: '2026-02' },
        });
        expect(badRange.statusCode).toBe(400);
    });

    it('pausar (active=false) impede novas gerações', async () => {
        const created = await app.inject({
            method: 'POST',
            url: '/admin/finance/recurrences',
            headers: bearer(token),
            payload: {
                type: 'OUT',
                description: 'INTERNET',
                amountCents: 15000,
                dayOfMonth: 5,
                startMonth: currentMonth(),
                accountId,
                active: false,
            },
        });
        const recId = json<{ id: string }>(created.body).id;

        await app.inject({ method: 'POST',
url: '/admin/finance/recurrences/generate',
headers: bearer(token) });
        expect(await prisma.financialTransaction.count({ where: { recurringId: recId } })).toBe(0);

        // Ativando, a próxima rodada gera o mês atual.
        const patched = await app.inject({
            method: 'PATCH',
            url: `/admin/finance/recurrences/${recId}`,
            headers: bearer(token),
            payload: { active: true },
        });
        expect(patched.statusCode, patched.body).toBe(200);
        await app.inject({ method: 'POST',
url: '/admin/finance/recurrences/generate',
headers: bearer(token) });
        expect(await prisma.financialTransaction.count({ where: { recurringId: recId } })).toBe(1);
    });

    it('excluir a recorrência não apaga os lançamentos já gerados', async () => {
        const created = await app.inject({
            method: 'POST',
            url: '/admin/finance/recurrences',
            headers: bearer(token),
            payload: {
                type: 'OUT',
                description: 'AGUA',
                amountCents: 8000,
                dayOfMonth: 15,
                startMonth: currentMonth(),
                accountId,
            },
        });
        const recId = json<{ id: string }>(created.body).id;
        await app.inject({ method: 'POST',
url: '/admin/finance/recurrences/generate',
headers: bearer(token) });
        expect(await prisma.financialTransaction.count({ where: { recurringId: recId } })).toBe(1);

        const removed = await app.inject({
            method: 'DELETE',
            url: `/admin/finance/recurrences/${recId}`,
            headers: bearer(token),
        });
        expect(removed.statusCode, removed.body).toBe(204);

        // O lançamento continua no caixa (a recorrência some da lista).
        expect(await prisma.financialTransaction.count({
            where: { description: 'AGUA',
isDeleted: false },
        })).toBe(1);
        const list = await app.inject({
            method: 'GET',
            url: '/admin/finance/recurrences?all=true',
            headers: bearer(token),
        });
        expect(json<{ id: string }[]>(list.body).some(r => r.id === recId)).toBe(false);
    });

    it('403 sem permissão de Financeiro', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/admin/finance/recurrences',
            headers: bearer(noFinanceToken),
        });
        expect(res.statusCode).toBe(403);
    });
});

describe('Formas de pagamento', () => {
    it('cria com o nome normalizado e recusa repetido', async () => {
        const created = await app.inject({
            method: 'POST',
            url: '/admin/finance/payment-methods',
            headers: bearer(token),
            payload: { name: ' boleto bancario ' },
        });
        expect(created.statusCode, created.body).toBe(201);
        expect(json<{ name: string }>(created.body).name).toBe('BOLETO BANCARIO');

        const dup = await app.inject({
            method: 'POST',
            url: '/admin/finance/payment-methods',
            headers: bearer(token),
            payload: { name: 'Boleto Bancario' },
        });
        expect(dup.statusCode).toBe(409);
    });

    it('lista, desativa e some da lista padrão', async () => {
        const created = await app.inject({
            method: 'POST',
            url: '/admin/finance/payment-methods',
            headers: bearer(token),
            payload: { name: 'VALE' },
        });
        const id = json<{ id: string }>(created.body).id;

        const before = await app.inject({
            method: 'GET',
            url: '/admin/finance/payment-methods',
            headers: bearer(token),
        });
        expect(json<{ name: string }[]>(before.body).some(m => m.name === 'VALE')).toBe(true);

        expect((await app.inject({
            method: 'DELETE',
            url: `/admin/finance/payment-methods/${id}`,
            headers: bearer(token),
        })).statusCode).toBe(204);

        const after = await app.inject({
            method: 'GET',
            url: '/admin/finance/payment-methods',
            headers: bearer(token),
        });
        expect(json<{ name: string }[]>(after.body).some(m => m.name === 'VALE')).toBe(false);
    });

    it('filtra os lançamentos pela forma de pagamento (sem diferenciar maiúsculas)', async () => {
        await app.inject({
            method: 'POST',
            url: '/admin/finance/transactions',
            headers: bearer(token),
            payload: {
                type: 'OUT',
amountCents: 5000,
date: '2026-03-10',
                description: 'COMPRA COM CARTAO',
method: 'CARTÃO',
accountId: otherAccountId,
            },
        });
        await app.inject({
            method: 'POST',
            url: '/admin/finance/transactions',
            headers: bearer(token),
            payload: {
                type: 'OUT',
amountCents: 7000,
date: '2026-03-11',
                description: 'COMPRA COM PIX',
method: 'pix',
accountId: otherAccountId,
            },
        });

        const res = await app.inject({
            method: 'GET',
            url: '/admin/finance/transactions?method=PIX',
            headers: bearer(token),
        });
        const page = json<{ data: { description: string }[] }>(res.body);
        expect(page.data.every(t => t.description !== 'COMPRA COM CARTAO')).toBe(true);
        expect(page.data.some(t => t.description === 'COMPRA COM PIX')).toBe(true);

        // O CSV respeita o mesmo filtro.
        const csv = await app.inject({
            method: 'GET',
            url: '/admin/finance/transactions/export?method=PIX',
            headers: bearer(token),
        });
        expect(csv.statusCode).toBe(200);
        expect(csv.body).toContain('COMPRA COM PIX');
        expect(csv.body).not.toContain('COMPRA COM CARTAO');
    });
});

describe('Fechamento mensal', () => {
    const month = '2026-04';
    // Caixa exclusivo: as recorrências deste arquivo lançam nos outros caixas.
    let closingAccountId: string;

    beforeAll(async () => {
        const account = await app.inject({
            method: 'POST',
            url: '/admin/finance/accounts',
            headers: bearer(token),
            payload: { name: 'CAIXA FECHAMENTO' },
        });
        closingAccountId = json<{ id: string }>(account.body).id;
        // Abertura de março: +1.000,00. Em abril: +500,00 e −200,00 → esperado 1.300,00.
        const base = { accountId: closingAccountId };
        await app.inject({
            method: 'POST',
            url: '/admin/finance/transactions',
            headers: bearer(token),
            payload: { ...base,
type: 'IN',
amountCents: 100000,
date: '2026-03-01',
description: 'ABERTURA' },
        });
        await app.inject({
            method: 'POST',
            url: '/admin/finance/transactions',
            headers: bearer(token),
            payload: { ...base,
type: 'IN',
amountCents: 50000,
date: '2026-04-05',
description: 'MENSALIDADES ABRIL' },
        });
        await app.inject({
            method: 'POST',
            url: '/admin/finance/transactions',
            headers: bearer(token),
            payload: { ...base,
type: 'OUT',
amountCents: 20000,
date: '2026-04-20',
description: 'MATERIAL ABRIL' },
        });
    });

    it('a prévia traz abertura, entradas, saídas e o saldo esperado', async () => {
        const res = await app.inject({
            method: 'GET',
            url: `/admin/finance/closings/preview?accountId=${closingAccountId}&month=${month}`,
            headers: bearer(token),
        });
        expect(res.statusCode, res.body).toBe(200);
        const p = json<{
            openingCents: number;
            inCents: number;
            outCents: number;
            expectedBalanceCents: number;
            closing: unknown;
        }>(res.body);
        expect(p.openingCents).toBe(100000);
        expect(p.inCents).toBe(50000);
        expect(p.outCents).toBe(20000);
        expect(p.expectedBalanceCents).toBe(130000);
        expect(p.closing).toBeNull();
    });

    it('fecha o mês com o esperado recalculado no servidor e a diferença apurada', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/admin/finance/closings',
            headers: bearer(token),
            payload: {
                accountId: closingAccountId,
                month,
                countedBalanceCents: 129500,
                // Valor inventado pelo cliente: tem de ser ignorado.
                expectedBalanceCents: 1,
                notes: 'FALTARAM 5 REAIS',
            },
        });
        expect(res.statusCode, res.body).toBe(201);
        const closing = json<{
            id: string;
            expectedBalanceCents: number;
            differenceCents: number;
        }>(res.body);
        expect(closing.expectedBalanceCents).toBe(130000);
        expect(closing.differenceCents).toBe(-500);
    });

    it('recusa fechar o mesmo mês/caixa duas vezes', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/admin/finance/closings',
            headers: bearer(token),
            payload: { accountId: closingAccountId,
month,
countedBalanceCents: 130000 },
        });
        expect(res.statusCode).toBe(409);
    });

    it('lista por caixa e ano, e reabre o mês', async () => {
        const list = await app.inject({
            method: 'GET',
            url: `/admin/finance/closings?accountId=${closingAccountId}&year=2026`,
            headers: bearer(token),
        });
        const rows = json<{
 id: string;
month: string 
}[]>(list.body);
        expect(rows).toHaveLength(1);
        expect(rows[0].month).toBe(month);

        const reopened = await app.inject({
            method: 'DELETE',
            url: `/admin/finance/closings/${rows[0].id}`,
            headers: bearer(token),
        });
        expect(reopened.statusCode).toBe(204);

        const after = await app.inject({
            method: 'GET',
            url: `/admin/finance/closings?accountId=${closingAccountId}&year=2026`,
            headers: bearer(token),
        });
        expect(json<unknown[]>(after.body)).toHaveLength(0);

        // Os lançamentos do mês continuam intactos.
        expect(await prisma.financialTransaction.count({
            where: { accountId: closingAccountId,
description: 'MENSALIDADES ABRIL' },
        })).toBe(1);
    });

    it('403 sem permissão de Financeiro', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/admin/finance/closings',
            headers: bearer(noFinanceToken),
            payload: { accountId: closingAccountId,
month: '2026-05',
countedBalanceCents: 0 },
        });
        expect(res.statusCode).toBe(403);
    });
});
