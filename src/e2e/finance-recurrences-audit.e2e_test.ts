/**
 * Financeiro: auditoria da geração de recorrentes (SR-079, B-D2) — E2E.
 *
 * O painel chama POST /admin/finance/recurrences/generate toda vez que a tela do
 * Financeiro abre. Quando não há nada a gerar, a trilha não pode ganhar linha
 * nem o banco pode ser escrito; quando gera, a linha diz quantos lançamentos e
 * de quais recorrências.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '../generated/prisma/client.js';
import { describeAuditAction } from '../lib/audit-sentence.js';
import { createTestApp } from './helpers/create-test-app.js';
import { createTestPrisma, cleanDatabase, seedSuperAdmin, loginAndGetToken, bearer } from './helpers/db.js';

let app: FastifyInstance;
let prisma: PrismaClient;
let token: string;

const GENERATE = '/admin/finance/recurrences/generate';
const json = <T>(body: string) => JSON.parse(body) as T;

function currentMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function addMonths(month: string, n: number): string {
    const [y, m] = month.split('-').map(Number);
    const total = y * 12 + (m - 1) + n;
    return `${String(Math.floor(total / 12)).padStart(4, '0')}-${String((total % 12) + 1).padStart(2, '0')}`;
}

const generate = () => app.inject({ method: 'POST',
url: GENERATE,
headers: bearer(token) });
const generateLines = () => prisma.auditLog.findMany({ where: { path: GENERATE },
orderBy: { createdAt: 'asc' } });

/**
 * A linha da auditoria é gravada depois da resposta. Faz uma ação comum que
 * grava a sua e espera por ela: as linhas anteriores já estão no banco.
 */
async function settleAudit(): Promise<void> {
    const name = `ESPERA ${Date.now()}-${Math.random()}`;
    const res = await app.inject({
        method: 'POST',
        url: '/admin/finance/categories',
        headers: bearer(token),
        payload: { name,
type: 'IN' },
    });
    expect(res.statusCode, res.body).toBe(201);
    for (let i = 0; i < 100; i++) {
        if (await prisma.auditLog.findFirst({ where: { targetLabel: name } })) return;
        await new Promise(r => setTimeout(r, 50));
    }
    throw new Error('A linha de auditoria não apareceu.');
}

/** Foto do que a geração pode escrever: lançamentos e moldes (inclui updatedAt). */
async function financeSnapshot(): Promise<string> {
    const [transactions, recurrences] = await Promise.all([
        prisma.financialTransaction.findMany({ orderBy: { id: 'asc' } }),
        prisma.financeRecurringTransaction.findMany({ orderBy: { id: 'asc' } }),
    ]);
    return JSON.stringify({ transactions,
recurrences });
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
    // O helper compartilhado não limpa a auditoria.
    await prisma.auditLog.deleteMany();
    await seedSuperAdmin(prisma);
    app = await createTestApp(prisma);
    token = await loginAndGetToken(app);
});

afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
});

describe('Auditoria da geração de recorrentes', () => {
    it('sem recorrência nenhuma: responde created 0, não escreve no banco e não deixa linha na auditoria', async () => {
        const before = await financeSnapshot();
        const res = await generate();
        expect(res.statusCode, res.body).toBe(200);
        expect(json<{ created: number }>(res.body).created).toBe(0);
        await settleAudit();
        expect(await generateLines()).toHaveLength(0);
        expect(await financeSnapshot()).toBe(before);
    });

    it('com recorrências, mas nada que falte gerar: segue sem linha e sem escrita', async () => {
        const create = await app.inject({
            method: 'POST',
            url: '/admin/finance/recurrences',
            headers: bearer(token),
            payload: {
                type: 'OUT',
                description: 'ALUGUEL DA SEDE',
                amountCents: 250000,
                dayOfMonth: 10,
                startMonth: currentMonth(),
            },
        });
        expect(create.statusCode, create.body).toBe(201);
        // Primeira rodada gera o mês atual (coberta no teste seguinte); a segunda e a terceira não têm o que fazer.
        expect(json<{ created: number }>((await generate()).body).created).toBe(1);
        await settleAudit();
        const linesAfterFirst = (await generateLines()).length;

        const before = await financeSnapshot();
        for (let i = 0; i < 2; i++) {
            const again = await generate();
            expect(again.statusCode, again.body).toBe(200);
            expect(json<{ created: number }>(again.body).created).toBe(0);
        }
        await settleAudit();
        expect(await generateLines()).toHaveLength(linesAfterFirst);
        expect(await financeSnapshot()).toBe(before);
    });

    it('ao gerar, a linha diz quantos lançamentos e de quais recorrências', async () => {
        await prisma.auditLog.deleteMany({ where: { path: GENERATE } });
        const start = addMonths(currentMonth(), -1);
        for (const description of ['LUZ DA SEDE', 'INTERNET']) {
            const res = await app.inject({
                method: 'POST',
                url: '/admin/finance/recurrences',
                headers: bearer(token),
                payload: { type: 'OUT',
description,
amountCents: 10000,
dayOfMonth: 5,
startMonth: start },
            });
            expect(res.statusCode, res.body).toBe(201);
        }

        const res = await generate();
        expect(res.statusCode, res.body).toBe(200);
        // Duas recorrências novas × (mês passado + atual).
        expect(json<{ created: number }>(res.body).created).toBe(4);
        await settleAudit();

        const lines = await generateLines();
        expect(lines).toHaveLength(1);
        const [line] = lines;
        expect(line.method).toBe('POST');
        expect(line.statusCode).toBe(200);
        expect(line.targetLabel).toContain('4 lançamentos');
        expect(line.targetLabel).toContain('INTERNET (2)');
        expect(line.targetLabel).toContain('LUZ DA SEDE (2)');
        const sentence = describeAuditAction(line);
        expect(sentence).toMatch(/^Gerou 4 lançamentos recorrentes/);

        // Rodar de novo, sem nada novo, não acrescenta linha.
        expect(json<{ created: number }>((await generate()).body).created).toBe(0);
        await settleAudit();
        expect(await generateLines()).toHaveLength(1);
    });

    it('um lançamento só fala no singular', async () => {
        await prisma.auditLog.deleteMany({ where: { path: GENERATE } });
        const res = await app.inject({
            method: 'POST',
            url: '/admin/finance/recurrences',
            headers: bearer(token),
            payload: {
                type: 'IN',
                description: 'MENSALIDADE UNICA',
                amountCents: 5000,
                dayOfMonth: 1,
                startMonth: currentMonth(),
            },
        });
        expect(res.statusCode, res.body).toBe(201);
        expect(json<{ created: number }>((await generate()).body).created).toBe(1);
        await settleAudit();
        const [line] = await generateLines();
        expect(describeAuditAction(line)).toBe('Gerou 1 lançamento recorrente (MENSALIDADE UNICA)');
    });
});
