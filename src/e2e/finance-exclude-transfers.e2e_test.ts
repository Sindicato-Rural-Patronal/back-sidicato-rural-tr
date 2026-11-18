import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '../generated/prisma/client.js';
import { createTestApp } from './helpers/create-test-app.js';
import { createTestPrisma, cleanDatabase, seedSuperAdmin, loginAndGetToken, bearer } from './helpers/db.js';
import { readXlsx } from '../lib/__tests__/xlsx-reader.js';

// Filtro `excludeTransfers` (SR-135) pelo caminho todo: lista, total, totais,
// CSV, Excel e PDF da exportação dos lançamentos.

let app: FastifyInstance;
let prisma: PrismaClient;
let token: string;

const LABEL = 'Sem transferências entre caixas';
const NOTA = 'Transferências entre caixas não entram nos totais.';
const FIELDS = ['number', 'date', 'type', 'description', 'amount'];

const get = (url: string) => app.inject({ method: 'GET',
url,
headers: bearer(token) });
const post = (url: string, payload: object) => app.inject({ method: 'POST',
url,
headers: bearer(token),
payload });

type Page = {
    data: { number: number }[];
    total: number;
    totalPages: number;
    totals: {
 incomeCents: number;
expenseCents: number 
};
};
const lista = async (query = ''): Promise<Page> => {
    const res = await get(`/admin/finance/transactions?${query}`);
    expect(res.statusCode, res.body).toBe(200);
    return res.json();
};

const csvLines = (body: string) => body.replace(/^﻿/, '').trim().split('\r\n');

beforeAll(async () => {
    prisma = createTestPrisma();
    await cleanDatabase(prisma);
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "AuditLog"');
    await prisma.$executeRawUnsafe(`
        TRUNCATE TABLE
            "FinanceMonthlyClosing", "FinancialAttachment", "FinancialTransaction",
            "FinanceRecurringTransaction", "FinancialCategory", "FinancialAccount", "FinancePaymentMethod"
        RESTART IDENTITY CASCADE
    `);
    await seedSuperAdmin(prisma);
    app = await createTestApp(prisma);
    token = await loginAndGetToken(app);

    const a = await prisma.financialAccount.create({ data: { name: 'CAIXA A SEMTRANSF' } });
    const b = await prisma.financialAccount.create({ data: { name: 'CAIXA B SEMTRANSF' } });
    const base = { date: new Date('2026-05-10T00:00:00.000Z'),
accountId: a.id };
    await prisma.financialTransaction.createMany({
        data: [
            { ...base,
number: 1,
type: 'IN',
amountCents: 10005,
description: 'Mensalidade maio' },
            { ...base,
number: 2,
type: 'OUT',
amountCents: 4000,
description: 'Compra de adubo' },
            { ...base,
number: 3,
type: 'OUT',
amountCents: 30000,
description: 'Transferência para B',
transferId: 'tr-1' },
            { ...base,
number: 4,
type: 'IN',
amountCents: 30000,
description: 'Transferência de A',
transferId: 'tr-1',
accountId: b.id },
        ],
    });
});

afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
});

describe('lista', () => {
    it('sem o filtro: as quatro linhas; os totais já não contavam a transferência', async () => {
        const page = await lista();
        expect(page.total).toBe(4);
        expect(page.totals).toEqual({ incomeCents: 10005,
expenseCents: 4000 });
    });

    it('"false" e vazio: igual a sem o filtro', async () => {
        for (const q of ['excludeTransfers=false', 'excludeTransfers=']) {
            const page = await lista(q);
            expect(page.total, q).toBe(4);
            expect(page.totals, q).toEqual({ incomeCents: 10005,
expenseCents: 4000 });
        }
    });

    it('com "true": sem as duas pernas; total, páginas e totais contam só o que sobra', async () => {
        const page = await lista('excludeTransfers=true&orderBy=number');
        expect(page.data.map(t => t.number)).toEqual([2, 1]);
        expect(page.total).toBe(2);
        expect(page.totals).toEqual({ incomeCents: 10005,
expenseCents: 4000 });
        const paged = await lista('excludeTransfers=true&limit=1&page=2&orderBy=number');
        expect(paged.data.map(t => t.number)).toEqual([1]);
        expect(paged.total).toBe(2);
        expect(paged.totalPages).toBe(2);
    });

    it('combina com os outros filtros', async () => {
        const page = await lista('excludeTransfers=true&type=IN');
        expect(page.data.map(t => t.number)).toEqual([1]);
        expect(page.total).toBe(1);
        expect((await lista('type=IN')).total).toBe(2);
    });

    it('valor inválido → 400 "Parâmetro inválido: excludeTransfers"', async () => {
        const res = await get('/admin/finance/transactions?excludeTransfers=talvez');
        expect(res.statusCode).toBe(400);
        expect(res.json().error).toBe('Parâmetro inválido: excludeTransfers');
    });
});

describe('exportação', () => {
    it('catálogo: o rótulo do filtro', async () => {
        const res = await get('/admin/export/finance-transactions/catalog');
        expect(res.json().filterLabels).toMatchObject({ excludeTransfers: LABEL });
    });

    it('PDF sem o filtro: as quatro linhas, os totais sem a transferência e a nota (como hoje)', async () => {
        const res = await post('/admin/export/finance-transactions', { fields: FIELDS,
format: 'pdf' });
        const pdf = res.json();
        expect(pdf.count).toBe(4);
        expect(pdf.filters).toBe('');
        expect(pdf.notaDosTotais).toBe(NOTA);
    });

    it('PDF com o filtro (POST boolean e GET "true"): sem as pernas, sem a nota, com o rótulo', async () => {
        const viaPost = await post('/admin/export/finance-transactions', { fields: FIELDS,
excludeTransfers: true,
format: 'pdf' });
        const viaGet = await get(`/admin/export/finance-transactions?fields=${FIELDS.join(',')}&excludeTransfers=true&format=pdf`);
        for (const res of [viaPost, viaGet]) {
            expect(res.statusCode, res.body).toBe(200);
            const pdf = res.json();
            expect(pdf.count).toBe(2);
            expect(pdf.filters).toBe(LABEL);
            expect(pdf.totais).toEqual([
                { rotulo: 'Total de entradas',
valor: 'R$ 100,05' },
                { rotulo: 'Total de saídas',
valor: 'R$ 40,00' },
            ]);
            expect('notaDosTotais' in pdf).toBe(false);
            expect(JSON.stringify(pdf.rows)).not.toContain('Transferência');
        }
    });

    it('Excel com o filtro: sem as pernas, sem a nota, o rótulo na aba "Sobre"', async () => {
        const res = await post('/admin/export/finance-transactions', { fields: FIELDS,
excludeTransfers: true,
format: 'xlsx' });
        expect(res.statusCode, res.body).toBe(200);
        expect(res.headers['x-export-count']).toBe('2');
        const { sheets: [dados, sobre] } = readXlsx(res.rawPayload);
        const all = JSON.stringify([dados.rows, sobre.rows]);
        expect(all).not.toContain('Transferência');
        expect(all).not.toContain(NOTA);
        expect(sobre.rows.find(([k]) => k === 'Filtros')).toEqual(['Filtros', LABEL]);
        expect(sobre.rows.find(([k]) => k === 'Escopo')).toEqual(['Escopo', 'Todos com os filtros']);
    });

    it('CSV com o filtro (com e sem fields): só as linhas sem transferência', async () => {
        for (const payload of [{ fields: FIELDS }, {}]) {
            const res = await post('/admin/export/finance-transactions', { ...payload,
excludeTransfers: true,
format: 'csv' });
            expect(res.statusCode, res.body).toBe(200);
            expect(res.headers['x-export-count']).toBe('2');
            expect(csvLines(res.body)).toHaveLength(3);
            expect(res.body).not.toContain('Transferência');
        }
    });

    it('CSV padrão sem o filtro continua com as 4 linhas e 13 colunas', async () => {
        const res = await get('/admin/export/finance-transactions');
        const lines = csvLines(res.body);
        expect(lines).toHaveLength(5);
        expect(lines[0].split('";"')).toHaveLength(13);
    });

    it('auditoria: o filtro aparece em details.filtros', async () => {
        await post('/admin/export/finance-transactions', { fields: FIELDS,
excludeTransfers: true,
format: 'pdf' });
        const log = await prisma.auditLog.findFirst({ where: { method: 'EXPORT' },
orderBy: { createdAt: 'desc' } });
        expect(log!.targetLabel).toMatch(/^Lançamentos: 2 registros \(com filtros\)/);
        expect(log!.details).toMatchObject({ escopo: 'com filtros',
filtros: [{ nome: LABEL,
valor: 'Sim' }],
linhas: 2 });
    });

    it('valor inválido → 400 (GET e POST)', async () => {
        const viaGet = await get('/admin/export/finance-transactions?excludeTransfers=talvez');
        const viaPost = await post('/admin/export/finance-transactions', { excludeTransfers: 'talvez' });
        for (const res of [viaGet, viaPost]) {
            expect(res.statusCode).toBe(400);
            expect(res.json().error).toBe('Parâmetro inválido: excludeTransfers');
        }
    });
});
