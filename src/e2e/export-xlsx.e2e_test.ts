import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hash } from 'bcrypt';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '../generated/prisma/client.js';
import { createTestApp } from './helpers/create-test-app.js';
import { createTestPrisma, cleanDatabase, seedSuperAdmin, loginAndGetToken, bearer } from './helpers/db.js';
import { readXlsx, serialToIso, type ReadSheet } from '../lib/__tests__/xlsx-reader.js';
import { columnName } from '../lib/xlsx.js';

// Excel (.xlsx) no montador de relatórios (SR-104): a resposta, os tipos das
// células, o cabeçalho preso, a fórmula que fica texto, a auditoria e o
// relatório de cadastros com uma aba por seção.

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

let app: FastifyInstance;
let prisma: PrismaClient;
let token: string;
const ids: Record<string, string> = {};
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

async function adminWith(username: string, permissions: string[]): Promise<string> {
    const rule = await prisma.rule.create({ data: { name: `RULE_${username}`,
description: 'x',
permissions: permissions as never } });
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

const get = (url: string, auth = token) => app.inject({ method: 'GET',
url,
headers: bearer(auth) });
const post = (url: string, payload: object, auth = token) =>
    app.inject({ method: 'POST',
url,
headers: bearer(auth),
payload });

function cellOf(sheet: ReadSheet, header: string, row = 2) {
    const col = sheet.rows[0].indexOf(header);
    expect(col, `coluna "${header}"`).toBeGreaterThanOrEqual(0);
    return sheet.cells.get(`${columnName(col)}${row}`);
}

const lastExport = () => prisma.auditLog.findFirst({ where: { method: 'EXPORT' },
orderBy: { createdAt: 'desc' } });

beforeAll(async () => {
    prisma = createTestPrisma();
    await cleanDatabase(prisma);
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "AuditLog"');
    // O `cleanDatabase` não limpa o Financeiro.
    await prisma.$executeRawUnsafe(`
        TRUNCATE TABLE
            "FinanceMonthlyClosing", "FinancialAttachment", "FinancialTransaction",
            "FinanceRecurringTransaction", "FinancialCategory", "FinancialAccount", "FinancePaymentMethod"
        RESTART IDENTITY CASCADE
    `);
    await seedSuperAdmin(prisma);
    app = await createTestApp(prisma);
    token = await loginAndGetToken(app);

    const ana = await prisma.userData.create({
        data: {
            name: 'ANA EXCEL',
            cpf: '52998224725',
            phone: '44911114001',
            birthDate: new Date('1990-03-15T00:00:00.000Z'),
            memberNotes: '=HYPERLINK("http://mal","clique")',
            createdAt: new Date('2026-01-02T15:30:00.000Z'),
        },
    });
    const bia = await prisma.userData.create({ data: { name: 'BIA EXCEL',
phone: '+55 44 3645-1234' } });

    const insumos = await prisma.financialCategory.create({ data: { name: 'INSUMOS EXCEL',
type: 'OUT' } });
    const banco = await prisma.financialAccount.create({ data: { name: 'BANCO EXCEL' } });
    await prisma.financialTransaction.create({
        data: {
            number: 10,
            type: 'OUT',
            amountCents: 150050,
            date: new Date('2026-05-10T00:00:00.000Z'),
            description: '@Compra de semente',
            method: 'PIX',
            categoryId: insumos.id,
            accountId: banco.id,
            empenho: { razaoSocial: 'JOSE DA SILVA',
cnpjCpf: '52998224725' },
        },
    });
    Object.assign(ids, { ana: ana.id,
bia: bia.id });
});

afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
});

describe('pessoas em Excel', () => {
    it('GET com fields: o arquivo, os headers e as células pelo tipo', async () => {
        const res = await get(`/admin/export/people?ids=${ids.ana},${ids.bia}&fields=ordinal,name,cpf,phone,birthDate,memberNotes,createdAt&format=xlsx`);
        expect(res.statusCode, res.body).toBe(200);
        expect(res.headers['content-type']).toBe(XLSX);
        expect(res.headers['content-disposition']).toBe(`attachment; filename="pessoas-${today}.xlsx"`);
        expect(res.headers['x-export-count']).toBe('2');
        expect(res.headers['access-control-expose-headers']).toBe('Content-Disposition, X-Export-Count');

        const { sheets } = readXlsx(res.rawPayload);
        expect(sheets.map(s => s.name)).toEqual(['Pessoas', 'Sobre']);
        const [dados] = sheets;
        expect(dados.rows[0]).toEqual(['Nº de ordem', 'Nome', 'CPF', 'Telefone', 'Nascimento', 'Observações', 'Cadastrado em']);
        expect(dados.xml).toContain('<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>');
        expect(dados.xml).toContain('<cols>');
        expect(dados.xml).not.toContain('<f');

        expect(cellOf(dados, 'Nº de ordem')).toMatchObject({ style: 0,
value: '1' });
        expect(cellOf(dados, 'Nome')).toMatchObject({ style: 2,
type: 'inlineStr',
value: 'ANA EXCEL' });
        expect(cellOf(dados, 'CPF')).toMatchObject({ style: 2,
value: '529.982.247-25' });
        expect(cellOf(dados, 'Telefone')).toMatchObject({ style: 2,
type: 'inlineStr',
value: '(44) 91111-4001' });
        expect(cellOf(dados, 'Telefone', 3)).toMatchObject({ style: 2,
value: '+55 44 3645-1234' });
        expect(cellOf(dados, 'Observações')).toMatchObject({
            style: 2,
            type: 'inlineStr',
            value: '=HYPERLINK("http://mal","clique")',
            formula: false,
        });
        const birth = cellOf(dados, 'Nascimento')!;
        expect(birth.style).toBe(4);
        expect(serialToIso(birth.value)).toBe('1990-03-15 00:00');
        const created = cellOf(dados, 'Cadastrado em')!;
        expect(created.style).toBe(5);
        expect(serialToIso(created.value)).toBe('2026-01-02 12:30');
    });

    it('POST sem fields: o padrão, com o telefone como gravado em célula de texto', async () => {
        const res = await post('/admin/export/people', { search: 'excel',
format: 'xlsx' });
        expect(res.statusCode, res.body).toBe(200);
        const { sheets: [dados, sobre] } = readXlsx(res.rawPayload);
        expect(dados.rows).toHaveLength(3);
        expect(dados.rows[0]).toHaveLength(57);
        expect(cellOf(dados, 'Telefone')).toMatchObject({ style: 2,
type: 'inlineStr',
value: '44911114001' });
        expect(sobre.rows.slice(0, 1)).toEqual([['Relatório', 'Pessoas']]);
        expect(sobre.rows.find(([k]) => k === 'Filtros')).toEqual(['Filtros', 'Busca: excel']);
    });

    it('a auditoria diz Excel; a frase é "planilha do Excel"', async () => {
        await post('/admin/export/people', { ids: [ids.ana],
fields: ['name', 'cpf'],
format: 'xlsx',
modelo: 'nome-cpf' });
        const log = await lastExport();
        expect(log).toMatchObject({
            path: '/admin/export/people',
            entity: 'Exportação',
            targetLabel: 'Pessoas: ANA EXCEL · Excel · com CPF',
        });
        expect(log!.details).toEqual({
            formato: 'xlsx',
            modelo: 'Nome e CPF',
            campos: ['Nome', 'CPF'],
            escopo: 'seleção',
            filtros: [{ nome: 'Seleção',
valor: '1 registro' }],
            linhas: 1,
        });
        const list = await get('/admin/audit-logs?action=export&q=Excel&limit=1');
        const row = (list.json() as { data: { summary: string }[] }).data[0];
        expect(row.summary).toBe('Exportou a planilha do Excel "Pessoas: ANA EXCEL · Excel · com CPF"');
    });

    it('a permissão por campo vale igual: 403 com os rótulos e sem linha na auditoria', async () => {
        const courseOnly = await adminWith('so.cursos.excel', ['READ_COURSE']);
        const before = await prisma.auditLog.count({ where: { method: 'EXPORT' } });
        const res = await post('/admin/export/registrations', { fields: ['name', 'rg'],
format: 'xlsx' }, courseOnly);
        expect(res.statusCode).toBe(403);
        expect(res.json()).toEqual({ error: 'Sem permissão para exportar: RG.' });
        expect(await prisma.auditLog.count({ where: { method: 'EXPORT' } })).toBe(before);
    });
});

describe('lançamentos do Financeiro em Excel', () => {
    it('dinheiro é número com formato de moeda; data é data; documento e texto com @ ficam texto', async () => {
        const financeOnly = await adminWith('so.financeiro.excel', ['READ_FINANCE']);
        const res = await post('/admin/export/finance-transactions', { format: 'xlsx' }, financeOnly);
        expect(res.statusCode, res.body).toBe(200);
        expect(res.headers['content-type']).toBe(XLSX);
        expect(res.headers['content-disposition']).toBe(`attachment; filename="lancamentos-${today}.xlsx"`);
        expect(res.headers['x-export-count']).toBe('1');

        const { sheets: [dados] } = readXlsx(res.rawPayload);
        expect(dados.name).toBe('Lançamentos');
        expect(dados.rows[0]).toEqual([
            'Nº', 'Data', 'Tipo', 'Caixa', 'Categoria', 'Descrição', 'Nome / Razão social', 'CNPJ / CPF',
            'Nº anterior', 'Método', 'Recorrente', 'Valor (R$)', 'Observações',
        ]);
        expect(cellOf(dados, 'Nº')).toMatchObject({ style: 0,
value: '10' });
        expect(cellOf(dados, 'Valor (R$)')).toMatchObject({ style: 3,
type: null,
value: '1500.5' });
        const date = cellOf(dados, 'Data')!;
        expect(date.style).toBe(4);
        expect(serialToIso(date.value)).toBe('2026-05-10 00:00');
        expect(cellOf(dados, 'CNPJ / CPF')).toMatchObject({ style: 2,
value: '52998224725' });
        expect(cellOf(dados, 'Descrição')).toMatchObject({ style: 2,
value: '@Compra de semente',
formula: false });

        const log = await lastExport();
        expect(log).toMatchObject({ path: '/admin/export/finance-transactions',
targetLabel: 'Lançamentos: 1 registro (todos) · Excel · com CNPJ / CPF' });
        expect((log!.details as { formato: string }).formato).toBe('xlsx');
    });

    it('a rota antiga continua só CSV (ignora format)', async () => {
        const res = await get('/admin/finance/transactions/export?format=xlsx');
        expect(res.statusCode, res.body).toBe(200);
        expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
        expect(res.headers['content-disposition']).toBe('attachment; filename="lancamentos.csv"');
    });
});

describe('relatório de cadastros em Excel', () => {
    it('uma aba por seção, sem fields; a auditoria termina em "· Excel"', async () => {
        const res = await get('/admin/export/cadastros?format=xlsx');
        expect(res.statusCode, res.body).toBe(200);
        expect(res.headers['content-type']).toBe(XLSX);
        expect(res.headers['content-disposition']).toBe(`attachment; filename="relatorio-de-cadastros-${today}.xlsx"`);
        const { sheets } = readXlsx(res.rawPayload);
        expect(sheets.map(s => s.name)).toEqual(['Pessoas físicas', 'Associados em dia', 'Pessoas jurídicas', 'Administradores', 'Sobre']);
        expect(sheets[0].rows[0]).toHaveLength(57);
        expect(sheets[0].xml).toContain('state="frozen"');

        const log = await lastExport();
        expect(log).toMatchObject({ path: '/admin/export/cadastros',
details: null });
        expect(log!.targetLabel).toMatch(/^Relatório de cadastros: \d{1,3}(\.\d{3})* registros \(todos\) · Excel$/);
        expect(res.headers['x-export-count']).toBe(String(sheets.slice(0, 4).reduce((n, s) => n + s.rows.length - 1, 0)));
    });

    it('com fields continua 400', async () => {
        const res = await get('/admin/export/cadastros?format=xlsx&fields=name');
        expect(res.statusCode).toBe(400);
        expect(res.json()).toEqual({ error: 'Este conjunto ainda não tem o montador.' });
    });
});
