import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '../generated/prisma/client.js';
import { createTestApp } from './helpers/create-test-app.js';
import { createTestPrisma, cleanDatabase, seedSuperAdmin, loginAndGetToken, bearer } from './helpers/db.js';

// GET /admin/finance/summary (`FinanceAdapter.summary`): saldo histórico, saldo
// por caixa, KPIs, categorias e meses do período. Toda a regra está no adapter,
// em consultas ao Postgres: transferência entre caixas move dinheiro mas não é
// receita nem despesa, "só nota" (sem tipo) não é dinheiro, lançamento excluído
// some, e o que está numa caixa excluída (ou sem caixa) vai para "Sem caixa".

let app: FastifyInstance;
let prisma: PrismaClient;
let token: string;
const ids: Record<string, string> = {};

const PERIOD = 'from=2026-03-01&to=2026-04-30';

type Summary = {
    balanceAllTimeCents: number;
    periodInCents: number;
    periodOutCents: number;
    periodResultCents: number;
    byCategory: {
 categoryId: string | null;
name: string;
type: 'IN' | 'OUT';
totalCents: number 
}[];
    byMonth: {
 month: string;
inCents: number;
outCents: number 
}[];
    byAccount: {
 accountId: string | null;
name: string;
balanceCents: number 
}[];
};

async function post(url: string, payload: object): Promise<{ id: string }> {
    const res = await app.inject({ method: 'POST',
url,
headers: bearer(token),
payload });
    expect(res.statusCode, res.body).toBe(201);
    return JSON.parse(res.body) as { id: string };
}

const lancamento = (payload: object) => post('/admin/finance/transactions', payload);

async function summary(query = PERIOD): Promise<Summary> {
    const res = await app.inject({ method: 'GET',
url: `/admin/finance/summary?${query}`,
headers: bearer(token) });
    expect(res.statusCode, res.body).toBe(200);
    return JSON.parse(res.body) as Summary;
}

const saldos = (s: Summary) => Object.fromEntries(s.byAccount.map(a => [a.name, a.balanceCents]));

beforeAll(async () => {
    prisma = createTestPrisma();
    await cleanDatabase(prisma);
    // O helper compartilhado não limpa o Financeiro, e o resumo soma TUDO.
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

    const a = await post('/admin/finance/accounts', { name: 'CAIXA A' });
    const b = await post('/admin/finance/accounts', { name: 'CAIXA B' });
    const c = await post('/admin/finance/accounts', { name: 'CAIXA C' });
    ids.a = a.id;
    const mensalidades = await post('/admin/finance/categories', { name: 'MENSALIDADES',
type: 'IN' });
    const energia = await post('/admin/finance/categories', { name: 'ENERGIA',
type: 'OUT' });
    ids.mensalidades = mensalidades.id;
    ids.energia = energia.id;

    // Dentro do período (março e abril de 2026).
    await lancamento({ type: 'IN',
amountCents: 100000,
date: '2026-03-10',
description: 'MENSALIDADES MARCO',
categoryId: mensalidades.id,
accountId: a.id });
    await lancamento({ type: 'OUT',
amountCents: 30000,
date: '2026-03-15',
description: 'CONTA DE LUZ',
categoryId: energia.id,
accountId: a.id });
    await lancamento({ type: 'IN',
amountCents: 50000,
date: '2026-04-05',
description: 'DOACAO',
accountId: b.id });
    await lancamento({ type: 'IN',
amountCents: 20000,
date: '2026-04-06',
description: 'VENDA NA CAIXA C',
accountId: c.id });
    await lancamento({ type: 'OUT',
amountCents: 5000,
date: '2026-04-07',
description: 'SAIDA SEM CAIXA' });
    // Antes do período: entra no saldo, não nos KPIs.
    await lancamento({ type: 'IN',
amountCents: 7000,
date: '2025-12-20',
description: 'SOBRA DE 2025',
accountId: a.id });
    // Excluído: some de tudo.
    const excluido = await lancamento({ type: 'IN',
amountCents: 88888,
date: '2026-04-08',
description: 'LANCADO ERRADO',
accountId: a.id });
    const del = await app.inject({ method: 'DELETE',
url: `/admin/finance/transactions/${excluido.id}`,
headers: bearer(token) });
    expect(del.statusCode, del.body).toBeLessThan(300);

    // Transferência de A para B: dois lançamentos ligados.
    await post('/admin/finance/transfers', { fromAccountId: a.id,
toAccountId: b.id,
amountCents: 25000,
date: '2026-04-10' });

    // A caixa C é excluída depois de ter movimento.
    const delC = await app.inject({ method: 'DELETE',
url: `/admin/finance/accounts/${c.id}`,
headers: bearer(token) });
    expect(delC.statusCode, delC.body).toBeLessThan(300);
});

afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
});

describe('resumo do período', () => {
    it('saldo histórico: tudo o que não foi excluído, de qualquer data, transferência incluída', async () => {
        // Entradas 100000 + 50000 + 20000 + 7000 + 25000 (transferência, chegada)
        // Saídas 30000 + 5000 + 25000 (transferência, saída)
        expect((await summary()).balanceAllTimeCents).toBe(142000);
    });

    it('KPIs: só o período, sem transferência e sem o lançamento excluído', async () => {
        const s = await summary();
        expect(s.periodInCents).toBe(170000);
        expect(s.periodOutCents).toBe(35000);
        expect(s.periodResultCents).toBe(135000);
    });

    it('por categoria (sem categoria separado por tipo) e por mês', async () => {
        const s = await summary();
        expect(s.byCategory).toEqual([
            expect.objectContaining({ categoryId: ids.mensalidades,
name: 'MENSALIDADES',
type: 'IN',
totalCents: 100000 }),
            expect.objectContaining({ categoryId: null,
name: 'Sem categoria',
type: 'IN',
totalCents: 70000 }),
            expect.objectContaining({ categoryId: ids.energia,
name: 'ENERGIA',
type: 'OUT',
totalCents: 30000 }),
            expect.objectContaining({ categoryId: null,
name: 'Sem categoria',
type: 'OUT',
totalCents: 5000 }),
        ]);
        expect(s.byMonth).toEqual([
            { month: '2026-03',
inCents: 100000,
outCents: 30000 },
            { month: '2026-04',
inCents: 70000,
outCents: 5000 },
        ]);
    });

    it('fora do período o mês não aparece, mas o saldo histórico é o mesmo', async () => {
        const s = await summary('from=2026-03-01&to=2026-03-31');
        expect(s.byMonth.map(m => m.month)).toEqual(['2026-03']);
        expect(s.periodResultCents).toBe(70000);
        expect(s.balanceAllTimeCents).toBe(142000);
    });

    it('saldo por caixa: a transferência move de A para B, a caixa excluída e o "sem caixa" viram "Sem caixa", e a soma fecha', async () => {
        const s = await summary();
        expect(saldos(s)).toEqual({ 'CAIXA A': 52000,
'CAIXA B': 75000,
'Sem caixa': 15000 });
        expect(s.byAccount.find(a => a.name === 'Sem caixa')?.accountId).toBeNull();
        expect(s.byAccount.reduce((sum, a) => sum + a.balanceCents, 0)).toBe(s.balanceAllTimeCents);
    });
});

describe('"só nota" (lançamento sem tipo)', () => {
    let antes: Summary;

    beforeAll(async () => {
        antes = await summary();
        await lancamento({ type: null,
amountCents: 9999,
date: '2026-04-11',
description: 'NOTA DE EMPENHO',
accountId: ids.a });
        await lancamento({ type: null,
amountCents: 4444,
date: '2026-04-12',
description: 'NOTA SEM CAIXA' });
    });

    it('fica fora do saldo histórico, dos KPIs, das categorias e dos meses', async () => {
        const depois = await summary();
        expect(depois.balanceAllTimeCents).toBe(antes.balanceAllTimeCents);
        expect(depois.periodInCents).toBe(antes.periodInCents);
        expect(depois.periodOutCents).toBe(antes.periodOutCents);
        expect(depois.byCategory).toEqual(antes.byCategory);
        expect(depois.byMonth).toEqual(antes.byMonth);
    });

    // BUG (SR-017): o saldo por caixa agrupa por (caixa, tipo) e soma
    // `total * (tipo === 'IN' ? 1 : -1)`, então o grupo de tipo null SUBTRAI.
    // Uma nota de empenho de R$ 99,99 na CAIXA A tira R$ 99,99 do saldo dela,
    // e a soma das caixas deixa de bater com o saldo histórico (que só soma
    // IN e OUT). Quando a correção entrar, troque `it.fails` por `it`.
    it('não mexe no saldo de nenhuma caixa', async () => {
        const depois = await summary();
        expect(saldos(depois)).toEqual(saldos(antes));
        expect(depois.byAccount.reduce((sum, a) => sum + a.balanceCents, 0)).toBe(depois.balanceAllTimeCents);
    });
});

describe('parâmetros', () => {
    // BUG (SR-017): o use case faz `querySchema.parse(query)` sem tratar o erro;
    // data que não é data estoura ZodError e a rota responde 500 em vez de 400.
    // Quando a correção entrar, troque `it.fails` por `it`.
    it.fails('data inválida → 400', async () => {
        const res = await app.inject({ method: 'GET',
url: '/admin/finance/summary?from=ontem',
headers: bearer(token) });
        expect(res.statusCode, res.body).toBe(400);
    });
});
