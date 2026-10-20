import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '../generated/prisma/client.js';
import { createTestApp } from './helpers/create-test-app.js';
import { createTestPrisma, cleanDatabase, seedSuperAdmin, loginAndGetToken, bearer } from './helpers/db.js';

// SR-039: a busca do Financeiro (lista, totais e CSV) acha também pela razão
// social e pelo nome fantasia do fornecedor da Nota de Empenho, sem diferenciar
// maiúscula nem acento, e o CSV traz quem está ligado a cada lançamento.

let app: FastifyInstance;
let prisma: PrismaClient;
let token: string;

type Page = {
 data: {
 id: string;
description: string 
}[];
totals: {
 incomeCents: number;
expenseCents: number 
} 
};

async function lancamento(payload: object): Promise<void> {
    const res = await app.inject({ method: 'POST',
url: '/admin/finance/transactions',
headers: bearer(token),
payload });
    expect(res.statusCode, res.body).toBe(201);
}

const base = { type: 'OUT',
date: '2026-05-10',
amountCents: 10000 };

async function buscar(search: string): Promise<Page> {
    const res = await app.inject({ method: 'GET',
url: `/admin/finance/transactions?search=${encodeURIComponent(search)}`,
headers: bearer(token) });
    expect(res.statusCode, res.body).toBe(200);
    return JSON.parse(res.body) as Page;
}

const descricoes = (p: Page) => p.data.map(t => t.description).sort();

beforeAll(async () => {
    prisma = createTestPrisma();
    await cleanDatabase(prisma);
    await prisma.$executeRawUnsafe(`
        TRUNCATE TABLE
            "FinanceMonthlyClosing", "FinancialAttachment", "FinancialTransaction",
            "FinanceRecurringTransaction", "FinancialCategory", "FinancialAccount", "FinancePaymentMethod"
        RESTART IDENTITY CASCADE
    `);
    await seedSuperAdmin(prisma);
    app = await createTestApp(prisma);
    token = await loginAndGetToken(app);

    await lancamento({ ...base,
description: 'Compra de adubo',
amountCents: 25000,
empenho: { razaoSocial: 'COOPERATIVA AGRÍCOLA SÃO JOÃO LTDA',
nomeFantasia: 'COOPAGRO',
cnpjCpf: '12.345.678/0001-90' } });
    await lancamento({ ...base,
description: 'Conserto da bomba',
amountCents: 5000,
empenho: { razaoSocial: '',
nomeFantasia: 'MECANICA DO ZE' ,
cnpjCpf: '123.456.789-09' } });
    await lancamento({ ...base,
description: 'Material de limpeza',
amountCents: 1000 });
    await lancamento({ ...base,
description: 'Diária do instrutor',
amountCents: 7000,
empenho: { razaoSocial: 'Sem Cnpj Ltda' } });
});

afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
});

describe('busca por fornecedor', () => {
    it('acha pela razão social em minúsculas e sem acento', async () => {
        expect(descricoes(await buscar('cooperativa agricola'))).toEqual(['Compra de adubo']);
        expect(descricoes(await buscar('são joão'))).toEqual(['Compra de adubo']);
        expect(descricoes(await buscar('SAO JOAO'))).toEqual(['Compra de adubo']);
    });

    it('acha pelo nome fantasia, também em minúsculas', async () => {
        expect(descricoes(await buscar('coopagro'))).toEqual(['Compra de adubo']);
        expect(descricoes(await buscar('mecanica do ze'))).toEqual(['Conserto da bomba']);
    });

    it('razão social gravada em minúsculas e com acento (cadastro antigo) também é achada', async () => {
        expect(descricoes(await buscar('SEM CNPJ'))).toEqual(['Diária do instrutor']);
    });

    it('continua achando pela descrição, e por descrição e fornecedor juntos', async () => {
        expect(descricoes(await buscar('limpeza'))).toEqual(['Material de limpeza']);
        expect(descricoes(await buscar('ltda'))).toEqual(['Compra de adubo', 'Diária do instrutor']);
    });

    it('% e _ digitados valem como texto na busca pelo fornecedor, não como curinga', async () => {
        // Sem escape, "coop%gro" e "coo_agro" achariam COOPAGRO.
        expect((await buscar('coop%gro')).data).toEqual([]);
        expect((await buscar('coopa_ro')).data).toEqual([]);
    });

    it('os totais seguem o mesmo filtro', async () => {
        const page = await buscar('cooperativa');
        expect(page.totals).toEqual({ incomeCents: 0,
expenseCents: 25000 });
    });

    it('lançamento excluído não aparece', async () => {
        const [row] = (await buscar('coopagro')).data;
        await prisma.financialTransaction.update({ where: { id: row.id },
data: { isDeleted: true,
deletedAt: new Date() } });
        expect((await buscar('coopagro')).data).toEqual([]);
        await prisma.financialTransaction.update({ where: { id: row.id },
data: { isDeleted: false,
deletedAt: null } });
    });
});

describe('CSV', () => {
    async function csv(query = ''): Promise<string[][]> {
        const res = await app.inject({ method: 'GET',
url: `/admin/finance/transactions/export${query}`,
headers: bearer(token) });
        expect(res.statusCode, res.body).toBe(200);
        return res.body.replace(/^﻿/, '').trim().split('\r\n').map(l => l.slice(1, -1).split('";"'));
    }

    it('traz Nome / Razão social e CNPJ / CPF depois da Descrição', async () => {
        const [header, ...rows] = await csv();
        expect(header.slice(4, 7)).toEqual(['Descrição', 'Nome / Razão social', 'CNPJ / CPF']);
        const byDesc = Object.fromEntries(rows.map(r => [r[4], r.slice(5, 7)]));
        expect(byDesc['Compra de adubo']).toEqual(['COOPERATIVA AGRÍCOLA SÃO JOÃO LTDA', '12.345.678/0001-90']);
        // Sem razão social, vale o nome fantasia.
        expect(byDesc['Conserto da bomba']).toEqual(['MECANICA DO ZE', '123.456.789-09']);
        // Sem empenho, ou sem CNPJ/CPF: vazio.
        expect(byDesc['Material de limpeza']).toEqual(['', '']);
        expect(byDesc['Diária do instrutor']).toEqual(['Sem Cnpj Ltda', '']);
    });

    it('a busca vale também para o CSV', async () => {
        const [, ...rows] = await csv('?search=coopagro');
        expect(rows.map(r => r[4])).toEqual(['Compra de adubo']);
    });
});
