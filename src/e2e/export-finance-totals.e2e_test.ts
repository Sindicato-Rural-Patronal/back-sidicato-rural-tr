import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '../generated/prisma/client.js';
import { createTestApp } from './helpers/create-test-app.js';
import { createTestPrisma, cleanDatabase, seedSuperAdmin, loginAndGetToken, bearer } from './helpers/db.js';
import { readXlsx } from '../lib/__tests__/xlsx-reader.js';

// Modelo "Contabilidade" e totais no Excel e no PDF dos Lançamentos (SR-131),
// pelo caminho todo: catálogo, banco, filtro "Entradas", transferência.

let app: FastifyInstance;
let prisma: PrismaClient;
let token: string;

const get = (url: string) => app.inject({ method: 'GET',
url,
headers: bearer(token) });
const post = (url: string, payload: object) => app.inject({ method: 'POST',
url,
headers: bearer(token),
payload });

const CONTABILIDADE = ['number', 'date', 'type', 'payeeName', 'payeeDocument', 'description', 'category', 'method', 'amount'];

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

    const mensalidade = await prisma.financialCategory.create({ data: { name: 'MENSALIDADE TOTAIS',
type: 'IN' } });
    const insumos = await prisma.financialCategory.create({ data: { name: 'INSUMOS TOTAIS',
type: 'OUT' } });
    const a = await prisma.financialAccount.create({ data: { name: 'CAIXA A TOTAIS' } });
    const b = await prisma.financialAccount.create({ data: { name: 'CAIXA B TOTAIS' } });
    const base = { date: new Date('2026-05-10T00:00:00.000Z'),
accountId: a.id };
    await prisma.financialTransaction.createMany({
        data: [
            { ...base,
number: 1,
type: 'IN',
amountCents: 10005,
description: 'Mensalidade maio',
method: 'PIX',
categoryId: mensalidade.id },
            { ...base,
number: 2,
type: 'IN',
amountCents: 259,
description: 'Taxa de inscrição',
method: 'DINHEIRO',
categoryId: mensalidade.id },
            { ...base,
number: 3,
type: 'OUT',
amountCents: 4000,
description: 'Compra de adubo',
method: 'PIX',
categoryId: insumos.id },
            // Transferência entre caixas: as duas pernas.
            { ...base,
number: 4,
type: 'OUT',
amountCents: 70000,
description: 'Transferência para B',
transferId: 'tr-1' },
            { ...base,
number: 5,
type: 'IN',
amountCents: 70000,
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

describe('modelo Contabilidade', () => {
    it('catálogo: o modelo vem depois do Resumido, com as colunas na ordem pedida', async () => {
        const res = await get('/admin/export/finance-transactions/catalog');
        expect(res.statusCode, res.body).toBe(200);
        const { modelos } = res.json() as {
 modelos: {
 id: string;
name: string;
fields: string[] 
}[] 
};
        expect(modelos.map(m => m.id)).toEqual(['resumido', 'contabilidade']);
        expect(modelos[1]).toEqual({ id: 'contabilidade',
name: 'Contabilidade',
fields: CONTABILIDADE });
    });

    it('exportar com o modelo e o filtro "Entradas": linhas só de entrada, tipo na linha de filtros, total só de entradas', async () => {
        const res = await post('/admin/export/finance-transactions', {
            fields: CONTABILIDADE,
            modelo: 'contabilidade',
            type: 'IN',
            format: 'pdf',
        });
        expect(res.statusCode, res.body).toBe(200);
        const pdf = res.json();
        expect(pdf).toMatchObject({
            modelo: 'Contabilidade',
            filters: 'Tipo: Entrada',
            count: 3,
            // A perna de entrada da transferência é linha do arquivo, mas não entra no total.
            totais: [{ rotulo: 'Total de entradas',
valor: 'R$ 102,64' }],
            notaDosTotais: 'Transferências entre caixas não entram nos totais.',
        });
        expect(pdf.columns.map((c: { label: string }) => c.label)).toEqual(
            ['Nº', 'Data', 'Tipo', 'Nome / Razão social', 'CNPJ / CPF', 'Descrição', 'Categoria', 'Método', 'Valor (R$)'],
        );
    });
});

describe('totais no Excel', () => {
    const xlsx = async (payload: object) => {
        const res = await post('/admin/export/finance-transactions', { format: 'xlsx',
...payload });
        expect(res.statusCode, res.body).toBe(200);
        return { res,
...readXlsx(res.rawPayload) };
    };

    it('só entradas (sem transferência): uma linha de total, depois de uma em branco; X-Export-Count só dos registros', async () => {
        const { res, sheets: [dados, sobre] } = await xlsx({ fields: CONTABILIDADE,
type: 'IN',
search: 'maio' });
        expect(res.headers['x-export-count']).toBe('1');
        expect(dados.rows).toHaveLength(4);
        expect(dados.rows[2]).toEqual([]);
        expect(dados.rows[3][0]).toBe('Total de entradas');
        expect(dados.cells.get('I4')).toMatchObject({ style: 3,
value: '100.05' });
        expect(dados.cells.get('I2')!.style).toBe(3);
        expect(sobre.rows.find(([k]) => k === 'Registros')).toEqual(['Registros', '1']);
        expect(sobre.rows.find(([k]) => k === 'Total de entradas')).toEqual(['Total de entradas', '100.05']);
        expect(sobre.rows.find(([k]) => k === 'Filtros')).toEqual(['Filtros', 'Tipo: Entrada · Busca: maio']);
    });

    it('entradas e saídas com transferência: dois totais fora a transferência, e a nota', async () => {
        const { res, sheets: [dados, sobre] } = await xlsx({ fields: CONTABILIDADE });
        expect(res.headers['x-export-count']).toBe('5');
        expect(dados.rows.slice(6)).toEqual([
            [],
            ['Total de entradas', '', '', '', '', '', '', '', '102.64'],
            ['Total de saídas', '', '', '', '', '', '', '', '40'],
            ['Transferências entre caixas não entram nos totais.'],
        ]);
        expect(sobre.rows.map(([k]) => k)).toEqual(
            ['Relatório', 'Gerado em', 'Registros', 'Total de entradas', 'Total de saídas', 'Observação', 'Escopo', 'Campos'],
        );
    });

    it('sem a coluna Valor: sem totais', async () => {
        const { dados } = await xlsx({ fields: ['number', 'description'] }).then(r => ({ dados: r.sheets[0] }));
        expect(dados.rows).toHaveLength(6);
        expect(JSON.stringify(dados.rows)).not.toContain('Total');
    });
});

describe('PDF e CSV', () => {
    it('PDF sem o Valor nas colunas: sem totais nem nota', async () => {
        const res = await post('/admin/export/finance-transactions', { fields: ['number', 'description'],
format: 'pdf' });
        const pdf = res.json();
        expect(pdf.count).toBe(5);
        expect('totais' in pdf).toBe(false);
        expect('notaDosTotais' in pdf).toBe(false);
    });

    it('PDF só de saídas, sem transferência: "Total de saídas" e sem nota', async () => {
        const res = await post('/admin/export/finance-transactions', { fields: CONTABILIDADE,
format: 'pdf',
search: 'adubo' });
        const pdf = res.json();
        expect(pdf.totais).toEqual([{ rotulo: 'Total de saídas',
valor: 'R$ 40,00' }]);
        expect('notaDosTotais' in pdf).toBe(false);
    });

    it('CSV com fields não tem total; o padrão (sem fields) segue com 13 colunas e 5 linhas', async () => {
        const res = await post('/admin/export/finance-transactions', { fields: CONTABILIDADE,
format: 'csv' });
        const lines = res.body.replace(/^﻿/, '').trim().split('\r\n');
        expect(lines).toHaveLength(6);
        expect(res.body).not.toContain('Total');
        const padrao = await get('/admin/export/finance-transactions');
        const rows = padrao.body.replace(/^﻿/, '').trim().split('\r\n');
        expect(rows).toHaveLength(6);
        expect(rows[0].split('";"')).toHaveLength(13);
    });

    it('a auditoria não muda: a linha diz o formato e os registros', async () => {
        await post('/admin/export/finance-transactions', { fields: CONTABILIDADE,
format: 'xlsx',
modelo: 'contabilidade' });
        const log = await prisma.auditLog.findFirst({ where: { method: 'EXPORT' },
orderBy: { createdAt: 'desc' } });
        expect(log!.targetLabel).toMatch(/^Lançamentos: 5 registros \(todos\) · Excel/);
        expect(log!.details).toMatchObject({ formato: 'xlsx',
modelo: 'Contabilidade',
linhas: 5 });
    });
});
