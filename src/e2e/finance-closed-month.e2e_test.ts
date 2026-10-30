/**
 * Financeiro: mês fechado trava lançamentos, e reativar recorrência pula a pausa
 * (SR-054, B1 e A4 do planejamento, decididos pelo usuário em 30/10) — E2E.
 *
 * Cobre: com o mês fechado no caixa, criar, editar, mover (pela data ou pelo
 * caixa) e excluir lançamento, e criar e excluir transferência, respondem 409
 * sem mudar nada; o mesmo mês em outro caixa e lançamento sem caixa seguem
 * livres; reabrir libera tudo; fechar e reabrir ficam na auditoria; reabrir
 * exige DELETE_FINANCE; a recorrência não lança em mês fechado e lança quando
 * ele é reaberto; reativar uma recorrência pausada não lança os meses da pausa.
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
let noDeleteToken: string;
let bancoId: string;
let cofreId: string;

const json = <T>(body: string) => JSON.parse(body) as T;

// Mês fechado dos testes de trava: fixo, longe do mês atual (que a geração usa).
const CLOSED = '2026-05';
const LOCKED_MESSAGE = 'O mês 05/2026 está fechado no caixa "BANCO". Reabra o mês para mudar lançamentos dele.';

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

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

function call(method: Method, url: string, payload?: object, auth = token) {
    return app.inject({
        method,
        url,
        headers: bearer(auth),
        payload,
    });
}

async function createTransaction(payload: Record<string, unknown>): Promise<string> {
    const res = await call('POST', '/admin/finance/transactions', {
        type: 'OUT',
        amountCents: 1000,
        description: 'LANCAMENTO',
        ...payload,
    });
    expect(res.statusCode, res.body).toBe(201);
    return json<{ id: string }>(res.body).id;
}

async function closeMonth(accountId: string, month: string): Promise<string> {
    const res = await call('POST', '/admin/finance/closings', {
        accountId,
        month,
        countedBalanceCents: 0,
    });
    expect(res.statusCode, res.body).toBe(201);
    return json<{ id: string }>(res.body).id;
}

async function reopen(closingId: string) {
    const res = await call('DELETE', `/admin/finance/closings/${closingId}`);
    expect(res.statusCode, res.body).toBe(204);
}

async function generate(): Promise<number> {
    const res = await call('POST', '/admin/finance/recurrences/generate');
    expect(res.statusCode, res.body).toBe(200);
    return json<{ created: number }>(res.body).created;
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

beforeAll(async () => {
    prisma = createTestPrisma();
    await cleanDatabase(prisma);
    // O helper compartilhado não limpa o Financeiro nem a auditoria.
    await prisma.$executeRawUnsafe(`
        TRUNCATE TABLE
            "FinanceMonthlyClosing",
            "FinancialAttachment",
            "FinancialTransaction",
            "FinanceRecurringTransaction",
            "FinancialCategory",
            "FinancialAccount",
            "FinancePaymentMethod",
            "AuditLog"
        RESTART IDENTITY CASCADE
    `);
    await seedSuperAdmin(prisma);
    app = await createTestApp(prisma);
    token = await loginAndGetToken(app);

    // Lança e edita, mas não tem DELETE_FINANCE: não reabre o mês.
    const rule = await prisma.rule.create({
        data: {
            name: 'FINANCEIRO_SEM_EXCLUIR',
            description: 'E2E',
            permissions: ['READ_FINANCE', 'CREATE_FINANCE', 'UPDATE_FINANCE'],
        },
    });
    const person = await prisma.userData.create({
        data: {
            name: 'Financeiro Sem Excluir',
            phone: '44900000054',
        },
    });
    await prisma.userAdmin.create({
        data: {
            username: 'finsemexcluir',
            passwordHash: await hash('finSemExcluir123!', 4),
            userDataId: person.id,
            rulesId: rule.id,
        },
    });
    noDeleteToken = await loginAndGetToken(app, 'finsemexcluir', 'finSemExcluir123!');

    for (const name of ['BANCO', 'COFRE']) {
        const res = await call('POST', '/admin/finance/accounts', { name });
        expect(res.statusCode, res.body).toBe(201);
        if (name === 'BANCO') bancoId = json<{ id: string }>(res.body).id;
        else cofreId = json<{ id: string }>(res.body).id;
    }
});

afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
});

describe('mês fechado trava lançamentos e transferências', () => {
    let mayId: string;
    let juneId: string;
    let cofreMayId: string;
    let transferLegId: string;
    let closingId: string;

    beforeAll(async () => {
        mayId = await createTransaction({
            accountId: bancoId,
            date: '2026-05-10',
            description: 'CONTA DE LUZ MAIO',
        });
        juneId = await createTransaction({
            accountId: bancoId,
            date: '2026-06-03',
            description: 'CONTA DE LUZ JUNHO',
        });
        cofreMayId = await createTransaction({
            accountId: cofreId,
            date: '2026-05-12',
            description: 'TROCO DO COFRE',
        });
        const transfer = await call('POST', '/admin/finance/transfers', {
            fromAccountId: cofreId,
            toAccountId: bancoId,
            amountCents: 5000,
            date: '2026-05-20',
        });
        expect(transfer.statusCode, transfer.body).toBe(201);
        // A perna do COFRE (que não está fechado): a do BANCO já basta para travar.
        const leg = await prisma.financialTransaction.findFirstOrThrow({
            where: {
                accountId: cofreId,
                transferId: { not: null },
            },
        });
        transferLegId = leg.id;

        closingId = await closeMonth(bancoId, CLOSED);
    });

    it('criar lançamento no mês fechado → 409 com a mensagem, e nada é gravado', async () => {
        const before = await prisma.financialTransaction.count();
        const res = await call('POST', '/admin/finance/transactions', {
            type: 'IN',
            amountCents: 2500,
            date: '2026-05-31',
            description: 'MENSALIDADE ATRASADA',
            accountId: bancoId,
        });
        expect(res.statusCode, res.body).toBe(409);
        expect(json<{ error: string }>(res.body).error).toBe(LOCKED_MESSAGE);
        expect(await prisma.financialTransaction.count()).toBe(before);
    });

    it('o mesmo mês em outro caixa e lançamento sem caixa seguem livres (a trava é por caixa)', async () => {
        await createTransaction({
            accountId: cofreId,
            date: '2026-05-25',
            description: 'COFRE MAIO',
        });
        await createTransaction({
            date: '2026-05-25',
            description: 'SEM CAIXA MAIO',
        });
        // Mês vizinho do mesmo caixa também.
        await createTransaction({
            accountId: bancoId,
            date: '2026-04-30',
            description: 'BANCO ABRIL',
        });
    });

    it('editar lançamento do mês fechado → 409, sem mudar nada', async () => {
        const res = await call('PATCH', `/admin/finance/transactions/${mayId}`, { amountCents: 99999 });
        expect(res.statusCode, res.body).toBe(409);
        expect(json<{ error: string }>(res.body).error).toBe(LOCKED_MESSAGE);
        const row = await prisma.financialTransaction.findUniqueOrThrow({ where: { id: mayId } });
        expect(row.amountCents).toBe(1000);
    });

    it('mover para fora do mês fechado (data ou caixa) → 409', async () => {
        const byDate = await call('PATCH', `/admin/finance/transactions/${mayId}`, { date: '2026-06-01' });
        expect(byDate.statusCode, byDate.body).toBe(409);
        const byAccount = await call('PATCH', `/admin/finance/transactions/${mayId}`, { accountId: cofreId });
        expect(byAccount.statusCode, byAccount.body).toBe(409);
        const row = await prisma.financialTransaction.findUniqueOrThrow({ where: { id: mayId } });
        expect(row.date.toISOString().slice(0, 10)).toBe('2026-05-10');
        expect(row.accountId).toBe(bancoId);
    });

    it('mover para dentro do mês fechado (data ou caixa) → 409', async () => {
        const byDate = await call('PATCH', `/admin/finance/transactions/${juneId}`, { date: '2026-05-28' });
        expect(byDate.statusCode, byDate.body).toBe(409);
        expect(json<{ error: string }>(byDate.body).error).toBe(LOCKED_MESSAGE);
        const byAccount = await call('PATCH', `/admin/finance/transactions/${cofreMayId}`, { accountId: bancoId });
        expect(byAccount.statusCode, byAccount.body).toBe(409);
        expect((await prisma.financialTransaction.findUniqueOrThrow({ where: { id: juneId } }))
            .date.toISOString().slice(0, 10)).toBe('2026-06-03');
        expect((await prisma.financialTransaction.findUniqueOrThrow({ where: { id: cofreMayId } }))
            .accountId).toBe(cofreId);
    });

    it('editar lançamento de mês aberto, sem entrar no fechado, continua valendo', async () => {
        const res = await call('PATCH', `/admin/finance/transactions/${juneId}`, { description: 'LUZ JUNHO' });
        expect(res.statusCode, res.body).toBe(200);
    });

    it('excluir lançamento do mês fechado → 409, e ele continua lá', async () => {
        const res = await call('DELETE', `/admin/finance/transactions/${mayId}`);
        expect(res.statusCode, res.body).toBe(409);
        const row = await prisma.financialTransaction.findUniqueOrThrow({ where: { id: mayId } });
        expect(row.isDeleted).toBe(false);
    });

    it('transferir no mês fechado (origem ou destino) → 409, sem criar as pernas', async () => {
        const before = await prisma.financialTransaction.count({ where: { transferId: { not: null } } });
        const intoBanco = await call('POST', '/admin/finance/transfers', {
            fromAccountId: cofreId,
            toAccountId: bancoId,
            amountCents: 1000,
            date: '2026-05-21',
        });
        expect(intoBanco.statusCode, intoBanco.body).toBe(409);
        expect(json<{ error: string }>(intoBanco.body).error).toBe(LOCKED_MESSAGE);
        const fromBanco = await call('POST', '/admin/finance/transfers', {
            fromAccountId: bancoId,
            toAccountId: cofreId,
            amountCents: 1000,
            date: '2026-05-21',
        });
        expect(fromBanco.statusCode, fromBanco.body).toBe(409);
        expect(await prisma.financialTransaction.count({ where: { transferId: { not: null } } })).toBe(before);
    });

    it('excluir a transferência pela perna do caixa aberto → 409, e as duas pernas ficam', async () => {
        const res = await call('DELETE', `/admin/finance/transactions/${transferLegId}`);
        expect(res.statusCode, res.body).toBe(409);
        const leg = await prisma.financialTransaction.findUniqueOrThrow({ where: { id: transferLegId } });
        expect(await prisma.financialTransaction.count({
            where: {
                transferId: leg.transferId,
                isDeleted: false,
            },
        })).toBe(2);
    });

    it('reabrir exige DELETE_FINANCE (403 sem ela) e não reabre', async () => {
        const res = await call('DELETE', `/admin/finance/closings/${closingId}`, undefined, noDeleteToken);
        expect(res.statusCode, res.body).toBe(403);
        expect(await prisma.financeMonthlyClosing.count({ where: { id: closingId } })).toBe(1);
    });

    it('reabrir libera tudo de novo', async () => {
        await reopen(closingId);

        const edit = await call('PATCH', `/admin/finance/transactions/${mayId}`, { amountCents: 1500 });
        expect(edit.statusCode, edit.body).toBe(200);
        const moveIn = await call('PATCH', `/admin/finance/transactions/${juneId}`, { date: '2026-05-28' });
        expect(moveIn.statusCode, moveIn.body).toBe(200);
        await createTransaction({
            accountId: bancoId,
            date: '2026-05-31',
            description: 'MENSALIDADE ATRASADA',
        });
        const transfer = await call('POST', '/admin/finance/transfers', {
            fromAccountId: cofreId,
            toAccountId: bancoId,
            amountCents: 1000,
            date: '2026-05-21',
        });
        expect(transfer.statusCode, transfer.body).toBe(201);
        const removeTransfer = await call('DELETE', `/admin/finance/transactions/${transferLegId}`);
        expect(removeTransfer.statusCode, removeTransfer.body).toBe(204);
        const remove = await call('DELETE', `/admin/finance/transactions/${mayId}`);
        expect(remove.statusCode, remove.body).toBe(204);
    });

    it('fechar e reabrir ficam na auditoria, com o caixa e o mês', async () => {
        const closed = await waitForAudit({
            method: 'POST',
            path: '/admin/finance/closings',
        });
        expect(closed.entity).toBe('Fechamento de caixa');
        expect(closed.targetLabel).toBe('05/2026 · BANCO');

        const reopened = await waitForAudit({
            method: 'DELETE',
            path: `/admin/finance/closings/${closingId}`,
        });
        expect(reopened.entity).toBe('Fechamento de caixa');
        expect(reopened.targetLabel).toBe('05/2026 · BANCO');
        // O fechamento é apagado ao reabrir: a trilha guarda o que estava fechado.
        const changes = reopened.changes as {
            field: string;
            before: unknown;
            after: unknown;
        }[];
        expect(changes).toContainEqual({
            field: 'month',
            before: CLOSED,
            after: null,
        });
        expect(changes).toContainEqual({
            field: 'account',
            before: 'BANCO',
            after: null,
        });
        expect(changes.some(c => c.field === 'countedBalanceCents')).toBe(true);

        const list = await call('GET', `/admin/audit-logs?entity=${encodeURIComponent('Fechamento de caixa')}`);
        expect(list.statusCode, list.body).toBe(200);
        const summaries = json<{ data: { summary: string }[] }>(list.body).data.map(r => r.summary);
        expect(summaries).toContain('Fechou o mês "05/2026 · BANCO"');
        expect(summaries).toContain('Reabriu o mês "05/2026 · BANCO"');
    });
});

describe('recorrência e mês fechado', () => {
    it('não lança no mês fechado do caixa; lança quando ele é reaberto', async () => {
        const current = currentMonth();
        const previous = addMonths(current, -1);
        const created = await call('POST', '/admin/finance/recurrences', {
            type: 'OUT',
            description: 'ALUGUEL DA SEDE',
            amountCents: 250000,
            dayOfMonth: 10,
            startMonth: addMonths(current, -2),
            accountId: bancoId,
        });
        expect(created.statusCode, created.body).toBe(201);
        const recId = json<{ id: string }>(created.body).id;
        const closingId = await closeMonth(bancoId, previous);

        // Dois meses atrás e o atual; o mês passado está fechado.
        expect(await generate()).toBe(2);
        const months = async () => (await prisma.financialTransaction.findMany({
            where: {
                recurringId: recId,
                isDeleted: false,
            },
        })).map(t => t.recurringMonth).sort();
        expect(await months()).toEqual([addMonths(current, -2), current]);

        // Rodar de novo com o mês ainda fechado não muda nada.
        expect(await generate()).toBe(0);

        await reopen(closingId);
        expect(await generate()).toBe(1);
        expect(await months()).toEqual([addMonths(current, -2), previous, current]);
        expect(await generate()).toBe(0);
    });
});

describe('reativar recorrência pausada (B1)', () => {
    it('pula os meses da pausa e volta a lançar a partir do mês atual, sem mexer no que já foi gerado', async () => {
        const current = currentMonth();
        const start = addMonths(current, -3);
        const created = await call('POST', '/admin/finance/recurrences', {
            type: 'OUT',
            description: 'INTERNET',
            amountCents: 15000,
            dayOfMonth: 5,
            startMonth: start,
            accountId: cofreId,
            active: false,
        });
        expect(created.statusCode, created.body).toBe(201);
        const recId = json<{ id: string }>(created.body).id;

        // Estado de uma recorrência que lançou o mês de início e foi pausada no
        // mês seguinte (a pausa cobre os dois meses antes do atual).
        const [y, m] = start.split('-').map(Number);
        const generatedBefore = await prisma.financialTransaction.create({
            data: {
                recurringId: recId,
                recurringMonth: start,
                type: 'OUT',
                amountCents: 15000,
                date: new Date(Date.UTC(y, m - 1, 5)),
                description: 'INTERNET',
                accountId: cofreId,
            },
        });
        await prisma.financeRecurringTransaction.update({
            where: { id: recId },
            data: { lastGeneratedMonth: start },
        });

        // Pausada não gera.
        expect(await generate()).toBe(0);

        const reactivated = await call('PATCH', `/admin/finance/recurrences/${recId}`, { active: true });
        expect(reactivated.statusCode, reactivated.body).toBe(200);

        // Só o mês atual; antes desta regra, saíam os dois da pausa junto.
        expect(await generate()).toBe(1);
        const rows = await prisma.financialTransaction.findMany({ where: { recurringId: recId } });
        expect(rows.map(r => r.recurringMonth).sort()).toEqual([start, current]);

        // O lançamento antigo não foi tocado.
        const old = await prisma.financialTransaction.findUniqueOrThrow({ where: { id: generatedBefore.id } });
        expect(old).toMatchObject({
            amountCents: 15000,
            isDeleted: false,
            recurringMonth: start,
        });
        const rec = await prisma.financeRecurringTransaction.findUniqueOrThrow({ where: { id: recId } });
        expect(rec.lastGeneratedMonth).toBe(current);
    });

    it('o corpo não consegue mexer no marcador da geração', async () => {
        const created = await call('POST', '/admin/finance/recurrences', {
            type: 'IN',
            description: 'MENSALIDADE',
            amountCents: 1000,
            dayOfMonth: 1,
            startMonth: currentMonth(),
        });
        const recId = json<{ id: string }>(created.body).id;
        const res = await call('PATCH', `/admin/finance/recurrences/${recId}`, { lastGeneratedMonth: '2099-01' });
        expect(res.statusCode, res.body).toBe(200);
        const rec = await prisma.financeRecurringTransaction.findUniqueOrThrow({ where: { id: recId } });
        expect(rec.lastGeneratedMonth).toBeNull();
    });
});
