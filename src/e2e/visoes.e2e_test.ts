import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hash } from 'bcrypt';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { Permission } from '../generated/prisma/enums.js';
import { createTestApp } from './helpers/create-test-app.js';
import { createTestPrisma, cleanDatabase, seedSuperAdmin, loginAndGetToken, bearer } from './helpers/db.js';
import { readXlsx } from '../lib/__tests__/xlsx-reader.js';

// Visões da tela (decisão 007, SR-149), pelo caminho todo: a lista de
// lançamentos com `fields` (as células são as do PDF da exportação), as visões
// de fábrica no catálogo, as visões da equipe com `filters` (banco, validação,
// auditoria "Visão da lista") e o "Visão:" na exportação.

type ListPage = {
    data: (Record<string, unknown> & { cells?: string[] })[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    totals: {
        incomeCents: number;
        expenseCents: number;
    };
    columns?: {
        key: string;
        label: string;
        type: string;
        weight: number;
        privacy: string;
    }[];
};

let app: FastifyInstance;
let prisma: PrismaClient;
let token: string;
let insumosId: string;
let bancoId: string;

const get = (url: string, t: string | null = token) => app.inject({ method: 'GET',
url,
headers: t ? bearer(t) : {} });
const send = (method: 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method,
url,
headers: bearer(token),
...(payload !== undefined && { payload }) });

async function adminWith(username: string, permissions: Permission[]): Promise<string> {
    const rule = await prisma.rule.create({ data: { name: `RULE_${username}`,
description: 'x',
permissions } });
    const person = await prisma.userData.create({ data: { name: `ADMIN ${username}`,
phone: '44900000000' } });
    await prisma.userAdmin.create({
        data: { username,
passwordHash: await hash('Senha12345!', 4),
userDataId: person.id,
rulesId: rule.id },
    });
    return loginAndGetToken(app, username, 'Senha12345!');
}

/** A linha da auditoria é gravada depois da resposta (onResponse): espera ela aparecer. */
async function waitForAudit(where: Record<string, unknown>) {
    for (let i = 0; i < 40; i++) {
        const row = await prisma.auditLog.findFirst({ where,
orderBy: { createdAt: 'desc' } });
        if (row) return row;
        await new Promise(r => setTimeout(r, 50));
    }
    throw new Error(`linha de auditoria não gravada: ${JSON.stringify(where)}`);
}

const CONTABILIDADE = ['number', 'date', 'type', 'payeeName', 'payeeDocument', 'description', 'category', 'method', 'amount'];
const MANY = ['ordinal', ...CONTABILIDADE, 'payeePhone', 'payeeZipCode', 'discount', 'recurring', 'transfer', 'notes', 'attachments', 'signature'];

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

    const mensalidade = await prisma.financialCategory.create({ data: { name: 'MENSALIDADE VISOES',
type: 'IN' } });
    const insumos = await prisma.financialCategory.create({ data: { name: 'INSUMOS VISOES',
type: 'OUT' } });
    insumosId = insumos.id;
    const banco = await prisma.financialAccount.create({ data: { name: 'BANCO VISOES' } });
    bancoId = banco.id;
    const outro = await prisma.financialAccount.create({ data: { name: 'CAIXA VISOES' } });
    const day = (d: string) => new Date(`${d}T00:00:00.000Z`);
    await prisma.financialTransaction.createMany({
        data: [
            { number: 1,
type: 'IN',
amountCents: 10005,
date: day('2026-05-10'),
description: 'Mensalidade maio',
method: 'PIX',
categoryId: mensalidade.id,
accountId: banco.id,
empenho: { razaoSocial: 'COOP LTDA',
cnpjCpf: '12.345.678/0001-90',
telefone: '44999998888',
cep: '85990000' } },
            { number: 2,
type: 'OUT',
amountCents: 4000,
date: day('2026-05-11'),
description: '=Compra de adubo',
method: 'PIX',
categoryId: insumos.id,
accountId: banco.id,
notes: '+obs',
empenho: { nomeFantasia: 'AGRO',
descontoCents: 150 } },
            { number: 3,
type: null,
amountCents: 9900,
date: day('2026-05-12'),
description: 'Só nota',
accountId: banco.id },
            { number: 4,
type: 'OUT',
amountCents: 70000,
date: day('2026-05-13'),
description: 'Transferência para caixa',
transferId: 'tr-v',
accountId: banco.id },
            { number: 5,
type: 'IN',
amountCents: 70000,
date: day('2026-05-13'),
description: 'Transferência do banco',
transferId: 'tr-v',
accountId: outro.id },
            { number: 6,
type: 'IN',
amountCents: 259,
date: day('2026-05-14'),
description: 'Taxa',
method: 'DINHEIRO',
categoryId: mensalidade.id,
accountId: banco.id,
recurringId: null },
        ],
    });
});

afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
});

describe('GET /admin/finance/transactions com fields', () => {
    it('sem fields, a resposta é a de sempre: sem columns nem cells', async () => {
        const res = await get('/admin/finance/transactions');
        expect(res.statusCode, res.body).toBe(200);
        const body = res.json() as ListPage;
        expect(Object.keys(body).sort()).toEqual(['data', 'limit', 'page', 'total', 'totalPages', 'totals']);
        expect(body.total).toBe(6);
        expect(body.data.every(r => !('cells' in r))).toBe(true);
    });

    it('com fields: columns na ordem e cells em cada linha, sem perder o lançamento inteiro', async () => {
        const res = await get('/admin/finance/transactions?orderBy=number&fields=number,payeeDocument,payeePhone,amount');
        expect(res.statusCode, res.body).toBe(200);
        const body = res.json() as ListPage;
        expect(body.columns).toEqual([
            { key: 'number',
label: 'Nº',
type: 'number',
weight: 1,
privacy: 'comum' },
            { key: 'payeeDocument',
label: 'CNPJ / CPF',
type: 'text',
weight: 2,
privacy: 'pessoal' },
            { key: 'payeePhone',
label: 'Telefone',
type: 'phone',
weight: 2,
privacy: 'pessoal' },
            { key: 'amount',
label: 'Valor (R$)',
type: 'money',
weight: 1.5,
privacy: 'comum' },
        ]);
        const first = body.data.find(r => r.number === 1)!;
        expect(first.cells).toEqual(['1', '12.345.678/0001-90', '(44) 99999-8888', '100,05']);
        // O lançamento cru continua, para as ações da tela.
        expect(first).toMatchObject({ description: 'Mensalidade maio',
category: { name: 'MENSALIDADE VISOES' },
account: { name: 'BANCO VISOES' },
attachments: [] });
        expect(body.totals).toEqual({ incomeCents: 10264,
expenseCents: 4000 });
    });

    it('as células são as do PDF da exportação, para os mesmos filtros e a mesma ordem', async () => {
        const casos: Record<string, string>[] = [
            { orderBy: 'number' },
            { type: 'IN',
excludeTransfers: 'true' },
            { accountId: bancoId,
search: 'compra' },
        ];
        for (const filters of casos) {
            const qs = new URLSearchParams({ ...filters,
fields: MANY.join(','),
limit: '100' });
            const list = await get(`/admin/finance/transactions?${qs}`);
            expect(list.statusCode, list.body).toBe(200);
            const pdf = await send('POST', '/admin/export/finance-transactions', { ...filters,
fields: MANY,
format: 'pdf' });
            expect(pdf.statusCode, pdf.body).toBe(200);
            const body = list.json() as ListPage;
            const { rows, columns } = pdf.json() as {
                rows: string[][];
                columns: { key: string }[];
            };
            expect(body.data.map(r => r.cells), JSON.stringify(filters)).toEqual(rows);
            expect(body.columns!.map(c => c.key)).toEqual(columns.map(c => c.key));
        }
    });

    it('fórmula sai como escrita (sem apóstrofo), como no PDF', async () => {
        const res = await get('/admin/finance/transactions?search=adubo&fields=description,notes,discount,signature');
        const body = res.json() as ListPage;
        expect(body.data[0].cells).toEqual(['=Compra de adubo', '+obs', '1,50', '']);
    });

    it('o Nº de ordem conta a lista inteira: página 2 de 4 começa em 5', async () => {
        const res = await get('/admin/finance/transactions?orderBy=number&limit=4&page=2&fields=ordinal,number');
        const body = res.json() as ListPage;
        expect(body.data.map(r => r.cells)).toEqual([['5', '2'], ['6', '1']]);
    });

    it.each([
        ['', 'Escolha pelo menos um campo.'],
        ['number,naoExiste', 'Campo desconhecido: naoExiste.'],
        ['number,number', 'Campo repetido: Nº.'],
        [Array.from({ length: 81 }, () => 'date').join(','), 'No máximo 80 campos por relatório.'],
    ])('fields=%j → 400 "%s"', async (fields, error) => {
        const res = await get(`/admin/finance/transactions?fields=${encodeURIComponent(fields)}`);
        expect(res.statusCode, res.body).toBe(400);
        expect(res.json()).toEqual({ error });
    });

    it('401 sem token, 403 sem READ_FINANCE', async () => {
        expect((await get('/admin/finance/transactions?fields=number', null)).statusCode).toBe(401);
        const semFinanceiro = await adminWith('sem_financeiro_visoes', ['READ_USER']);
        expect((await get('/admin/finance/transactions?fields=number', semFinanceiro)).statusCode).toBe(403);
    });

    it('ver a lista com fields não grava linha na auditoria', async () => {
        const before = await prisma.auditLog.count();
        await get('/admin/finance/transactions?fields=number,payeeDocument');
        await new Promise(r => setTimeout(r, 100));
        expect(await prisma.auditLog.count()).toBe(before);
    });
});

describe('catálogo: visoes', () => {
    it('os Lançamentos trazem as quatro visões de fábrica; as outras fontes não trazem o campo', async () => {
        const res = await get('/admin/export/finance-transactions/catalog');
        expect(res.statusCode, res.body).toBe(200);
        const { visoes, modelos } = res.json() as {
            visoes: {
                id: string;
                name: string;
                fields: string[];
                filters: Record<string, unknown> | null;
            }[];
            modelos: { id: string }[];
        };
        expect(visoes.map(v => v.id)).toEqual(['padrao-tela', 'contabilidade', 'completa', 'resumida']);
        expect(visoes[1]).toEqual({ id: 'contabilidade',
name: 'Contabilidade',
fields: CONTABILIDADE,
filters: { type: 'IN',
excludeTransfers: true,
periodo: 'mes-passado' } });
        expect(visoes[0].filters).toBeNull();
        expect(modelos.map(m => m.id)).toEqual(['resumido', 'contabilidade']);

        const people = await get('/admin/export/people/catalog');
        expect(people.json()).not.toHaveProperty('visoes');
    });
});

describe('visões da equipe: filters em /admin/report-templates/finance-transactions', () => {
    const BASE = '/admin/report-templates/finance-transactions';

    it('o modelo salvo antes (filters nulo no banco) aparece com filters null', async () => {
        const [admin] = await prisma.userAdmin.findMany({ take: 1 });
        await prisma.reportTemplate.create({ data: { dataset: 'finance-transactions',
name: 'Antigo do montador',
fields: ['number', 'amount'],
createdById: admin.id } });
        const res = await get(BASE);
        expect(res.statusCode, res.body).toBe(200);
        const antigo = (res.json() as {
 name: string;
filters: unknown 
}[]).find(t => t.name === 'Antigo do montador');
        expect(antigo).toMatchObject({ filters: null });
    });

    it('criar com filtros grava normalizado, a auditoria diz "Criou a visão"', async () => {
        const res = await send('POST', BASE, {
            name: 'Receitas do mês',
            fields: CONTABILIDADE,
            filters: { type: 'IN',
excludeTransfers: true,
categoryId: '',
method: null,
periodo: 'mes-passado' },
        });
        expect(res.statusCode, res.body).toBe(201);
        const t = res.json() as {
 id: string;
filters: unknown 
};
        expect(t.filters).toEqual({ type: 'IN',
excludeTransfers: true,
periodo: 'mes-passado' });
        const row = await prisma.reportTemplate.findUnique({ where: { id: t.id } });
        expect(row!.filters).toEqual({ type: 'IN',
excludeTransfers: true,
periodo: 'mes-passado' });

        const log = await waitForAudit({ method: 'POST',
path: BASE });
        expect(log).toMatchObject({ entity: 'Visão da lista',
targetLabel: 'Lançamentos: Receitas do mês' });
        const list = await get(`/admin/audit-logs?entity=${encodeURIComponent('Visão da lista')}`);
        expect(list.statusCode, list.body).toBe(200);
        expect((list.json() as { data: { summary: string }[] }).data[0].summary)
            .toBe('Criou a visão "Lançamentos: Receitas do mês"');
    });

    it('PATCH muda os filtros (changes em palavras, categoria pelo nome); null tira', async () => {
        const created = await send('POST', BASE, { name: 'Despesas',
fields: ['number', 'amount'],
filters: { type: 'OUT',
periodo: 'ano-atual' } });
        const { id } = created.json() as { id: string };

        const res = await send('PATCH', `${BASE}/${id}`, { filters: { type: 'OUT',
categoryId: insumosId,
accountId: bancoId,
excludeTransfers: true } });
        expect(res.statusCode, res.body).toBe(200);
        expect((res.json() as { filters: unknown }).filters).toEqual({ type: 'OUT',
categoryId: insumosId,
accountId: bancoId,
excludeTransfers: true });
        const log = await waitForAudit({ method: 'PATCH',
path: `${BASE}/${id}` });
        expect(log.entity).toBe('Visão da lista');
        expect(log.changes).toEqual([{ field: 'filters',
before: 'Tipo: Saída · Período: ano atual',
after: 'Tipo: Saída · Categoria: INSUMOS VISOES · Caixa: BANCO VISOES · Sem transferências entre caixas' }]);

        const cleared = await send('PATCH', `${BASE}/${id}`, { filters: null });
        expect(cleared.statusCode, cleared.body).toBe(200);
        expect((cleared.json() as { filters: unknown }).filters).toBeNull();
        expect((await prisma.reportTemplate.findUnique({ where: { id } }))!.filters).toBeNull();

        const del = await send('DELETE', `${BASE}/${id}`);
        expect(del.statusCode).toBe(204);
        const delLog = await waitForAudit({ method: 'DELETE',
path: `${BASE}/${id}` });
        expect(delLog.entity).toBe('Visão da lista');
    });

    it.each([
        [{ search: 'coop' }, 'Filtro inválido na visão: search.'],
        [{ from: '2026-01-01' }, 'Filtro inválido na visão: from.'],
        [{ categoryId: 'x' }, 'Filtro inválido na visão: categoryId.'],
        [{ periodo: 'setembro' }, 'Filtro inválido na visão: periodo.'],
        [['type'], 'Filtro inválido na visão: filters.'],
        [{ method: 'x'.repeat(2100) }, 'Os filtros da visão passam de 2 KB.'],
    ])('filters %j → 400 "%s", nada gravado', async (filters, error) => {
        const before = await prisma.reportTemplate.count();
        const res = await send('POST', BASE, { name: 'Ruim',
fields: ['number'],
filters });
        expect(res.statusCode, res.body).toBe(400);
        expect(res.json()).toEqual({ error });
        expect(await prisma.reportTemplate.count()).toBe(before);
    });

    it('fonte sem visões recusa filters; o modelo dela vem com filters null', async () => {
        const res = await send('POST', '/admin/report-templates/people', { name: 'Com filtro',
fields: ['name'],
filters: { search: 'x' } });
        expect(res.statusCode, res.body).toBe(400);
        expect(res.json()).toEqual({ error: 'Este relatório não guarda filtros.' });
        const ok = await send('POST', '/admin/report-templates/people', { name: 'Sem filtro',
fields: ['name'] });
        expect(ok.statusCode, ok.body).toBe(201);
        expect(ok.json()).toMatchObject({ filters: null });
        const log = await waitForAudit({ method: 'POST',
path: '/admin/report-templates/people' });
        expect(log.entity).toBe('Modelo de relatório');
    });

    it('409 com nome de visão de fábrica', async () => {
        const res = await send('POST', BASE, { name: 'resumida',
fields: ['number'] });
        expect(res.statusCode, res.body).toBe(409);
        expect(res.json()).toEqual({ error: 'Já existe uma visão de fábrica com esse nome.' });
    });
});

describe('exportar de uma visão: "Visão:" no arquivo', () => {
    it('PDF com visao: visao com o nome e modelo null; a auditoria guarda o nome em details.modelo', async () => {
        const res = await send('POST', '/admin/export/finance-transactions', {
            fields: CONTABILIDADE,
            type: 'IN',
            excludeTransfers: true,
            format: 'pdf',
            visao: 'Contabilidade (alterada)',
        });
        expect(res.statusCode, res.body).toBe(200);
        expect(res.json()).toMatchObject({ visao: 'Contabilidade (alterada)',
modelo: null,
filters: 'Tipo: Entrada · Sem transferências entre caixas',
totais: [{ rotulo: 'Total de entradas',
valor: 'R$ 102,64' }] });
        const log = await waitForAudit({ method: 'EXPORT',
path: '/admin/export/finance-transactions' });
        expect(log.details).toMatchObject({ formato: 'pdf',
modelo: 'Contabilidade (alterada)' });
    });

    it('Excel com visao: a aba "Sobre" diz "Visão"', async () => {
        const res = await send('POST', '/admin/export/finance-transactions', { fields: CONTABILIDADE,
format: 'xlsx',
visao: 'contabilidade' });
        expect(res.statusCode, res.body).toBe(200);
        const { sheets: [, sobre] } = readXlsx(res.rawPayload);
        expect(sobre.rows.find(([k]) => k === 'Visão')).toEqual(['Visão', 'Contabilidade']);
    });

    it('sem visao, o PDF não traz o campo; modelo e visao juntos → 400', async () => {
        const res = await send('POST', '/admin/export/finance-transactions', { fields: CONTABILIDADE,
format: 'pdf',
modelo: 'contabilidade' });
        expect(res.json()).not.toHaveProperty('visao');
        expect(res.json()).toMatchObject({ modelo: 'Contabilidade' });
        const both = await send('POST', '/admin/export/finance-transactions', { fields: CONTABILIDADE,
modelo: 'a',
visao: 'b' });
        expect(both.statusCode).toBe(400);
        expect(both.json()).toEqual({ error: 'Use modelo ou visao, não os dois.' });
    });

    it('a visão Completa sai igual, byte a byte, ao CSV sem fields', async () => {
        const catalog = (await get('/admin/export/finance-transactions/catalog')).json() as {
visoes: {
 id: string;
fields: string[] 
}[];
};
        const completa = catalog.visoes.find(v => v.id === 'completa')!;
        const sem = await get('/admin/export/finance-transactions?orderBy=number');
        const com = await send('POST', '/admin/export/finance-transactions', { orderBy: 'number',
fields: completa.fields,
visao: 'Completa (como a planilha de antes)' });
        expect(sem.statusCode).toBe(200);
        expect(com.statusCode).toBe(200);
        expect(com.body).toBe(sem.body);
    });
});
