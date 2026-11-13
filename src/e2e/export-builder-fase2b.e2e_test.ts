import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hash } from 'bcrypt';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '../generated/prisma/client.js';
import { createTestApp } from './helpers/create-test-app.js';
import { createTestPrisma, cleanDatabase, seedSuperAdmin, loginAndGetToken, bearer } from './helpers/db.js';

// Montador de relatórios, fase 2, parte B (decisão 006; SR-102): as fontes que
// saíram do caminho antigo por último respondem o catálogo, aceitam campos e
// PDF e gravam o que saiu na auditoria. O padrão de cada uma é o teste de
// ouro (`export-golden-fase2b.e2e_test.ts`).

let app: FastifyInstance;
let prisma: PrismaClient;
let token: string;
let superAdminId: string;

function rows(body: string): string[][] {
    return body
        .replace(/^﻿/, '')
        .trim()
        .split('\r\n')
        .map(line => line.slice(1, -1).split('";"'));
}

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

/** Admin com só estas permissões; devolve o token. */
async function adminWith(username: string, permissions: string[]): Promise<string> {
    const rule = await prisma.rule.create({ data: { name: `RULE_${username}`,
description: 'x',
permissions: permissions as never } });
    const person = await prisma.userData.create({ data: { name: `ADMIN ${username.toUpperCase()}`,
phone: '44900000000' } });
    await prisma.userAdmin.create({
        data: { username,
passwordHash: await hash('Senha12345!', 4),
userDataId: person.id,
rulesId: rule.id },
    });
    return loginAndGetToken(app, username, 'Senha12345!');
}

type Catalog = {
    dataset: string;
    title: string;
    groups: {
 name: string;
fields: {
 key: string;
label: string;
privacy: string;
allowed: boolean 
}[] 
}[];
    padrao: string[];
    modelos: {
 id: string;
name: string;
fields: string[] 
}[];
    filterLabels: Record<string, string>;
};

beforeAll(async () => {
    prisma = createTestPrisma();
    await cleanDatabase(prisma);
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "AuditLog"');
    const { userAdmin } = await seedSuperAdmin(prisma);
    superAdminId = userAdmin.id;
    app = await createTestApp(prisma);
    token = await loginAndGetToken(app);
});

afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
});

const get = (url: string, auth = token) => app.inject({ method: 'GET',
url,
headers: auth ? bearer(auth) : {} });
const post = (url: string, payload: object, auth = token) => app.inject({ method: 'POST',
url,
headers: bearer(auth),
payload });
const lastExport = () => prisma.auditLog.findFirst({ where: { method: 'EXPORT' },
orderBy: { createdAt: 'desc' } });

describe('auditoria', () => {
    it('catálogo: 200, com os grupos, o padrão, o modelo Resumida e o campo novo; sem READ_AUDIT, 403', async () => {
        const res = await get('/admin/export/audit-logs/catalog');
        expect(res.statusCode, res.body).toBe(200);
        const catalog = res.json() as Catalog;
        expect(catalog).toMatchObject({ dataset: 'audit-logs',
title: 'Auditoria' });
        expect(catalog.groups.map(g => g.name)).toEqual(['Registro', 'De onde veio', 'Detalhes', 'Relatório']);
        expect(catalog.padrao).toHaveLength(10);
        expect(catalog.modelos.map(m => m.id)).toEqual(['resumida']);
        expect(catalog.groups.flatMap(g => g.fields).find(f => f.key === 'exportDetails')).toMatchObject({
            label: 'Detalhes da exportação',
            privacy: 'comum',
            allowed: true,
        });
        // O filtro "Tipo" da tela; a coluna continua "Área".
        expect(catalog.filterLabels).toMatchObject({ action: 'Ação',
entity: 'Tipo',
actorId: 'Quem',
q: 'Busca' });

        const userOnly = await adminWith('so.usuarios.auditoria', ['READ_USER']);
        expect((await get('/admin/export/audit-logs/catalog', userOnly)).statusCode).toBe(403);
        expect((await get('/admin/export/audit-logs?fields=actor', userOnly)).statusCode).toBe(403);
    });

    it('"Detalhes da exportação" mostra o que uma exportação anterior levou', async () => {
        await prisma.userData.create({ data: { name: 'PESSOA AUDITADA',
cpf: '52998224725',
phone: '44911117001' } });
        const people = await get('/admin/export/people?search=auditada&fields=name,cpf&modelo=nome-cpf');
        expect(people.statusCode, people.body).toBe(200);

        const res = await get('/admin/export/audit-logs?action=export&fields=actor,target,exportDetails');
        expect(res.statusCode, res.body).toBe(200);
        expect(rows(res.body)).toEqual([
            ['Quem', 'Alvo', 'Detalhes da exportação'],
            [
                'e2eadmin',
                'Pessoas: 1 registro (com filtros) · CSV · com CPF',
                'Formato: CSV; Modelo: Nome e CPF; Campos: Nome, CPF; Escopo: com filtros; Filtros: Busca: auditada; Linhas: 1',
            ],
        ]);
    });

    it('PDF com o modelo Resumida e os filtros em palavras; a própria exportação fica na auditoria', async () => {
        const res = await post('/admin/export/audit-logs', {
            fields: ['createdAt', 'actor', 'action', 'target'],
            format: 'pdf',
            modelo: 'resumida',
            action: 'export',
            entity: 'Exportação',
            actorId: superAdminId,
            from: '2020-01-01',
            to: today(),
        });
        expect(res.statusCode, res.body).toBe(200);
        expect(res.headers['content-type']).toContain('application/json');
        const pdf = res.json() as {
 title: string;
filename: string;
filters: string;
modelo: string;
rows: string[][] 
};
        expect(pdf).toMatchObject({
            title: 'Auditoria',
            filename: `auditoria-${today()}.pdf`,
            filters: `Ação: Exportações · Tipo: Exportação · Quem: e2eadmin · Período: 01/01/2020 a ${today().split('-').reverse().join('/')}`,
            modelo: 'Resumida',
        });
        // A exportação de pessoas e a da auditoria do teste anterior, da mais recente.
        expect(pdf.rows.map(r => r.slice(1))).toEqual([
            ['e2eadmin', 'Exportou uma planilha', 'Auditoria: 1 registro (com filtros) · CSV'],
            ['e2eadmin', 'Exportou uma planilha', 'Pessoas: 1 registro (com filtros) · CSV · com CPF'],
        ]);

        const log = await lastExport();
        expect(log).toMatchObject({
            path: '/admin/export/audit-logs',
            targetLabel: 'Auditoria: 2 registros (com filtros) · PDF',
        });
        expect(log!.details).toMatchObject({ formato: 'pdf',
modelo: 'Resumida',
campos: ['Data e hora', 'Quem', 'Ação', 'Alvo'],
linhas: 2 });
        expect((log!.details as { filtros: unknown[] }).filtros).toContainEqual({ nome: 'Tipo',
valor: 'Exportação' });
    });

    it('o padrão cita IP, local e aparelho no alvo da auditoria; campo desconhecido → 400', async () => {
        const res = await get('/admin/export/audit-logs?action=login');
        expect(res.statusCode, res.body).toBe(200);
        expect((await lastExport())!.targetLabel).toMatch(/^Auditoria: \d+ registros? \(com filtros\) · CSV · com IP, Local, Aparelho$/);
        const bad = await get('/admin/export/audit-logs?fields=senha');
        expect(bad.statusCode).toBe(400);
        expect(bad.json()).toEqual({ error: 'Campo desconhecido: senha.' });
    });
});

describe('reservas de sala', () => {
    let salaId: string;

    beforeAll(async () => {
        const sala = await prisma.room.create({ data: { name: 'SALA MONTADOR',
description: 'x',
maxCapacity: 10 } });
        const ana = await prisma.userData.create({ data: { name: 'ANA RESPONSAVEL',
phone: '44911117101' } });
        await prisma.roomBooking.create({
            data: {
                type: 'EVENT',
                title: 'Dia de campo',
                description: 'Levar lanche',
                publicOnSite: true,
                publicDescription: 'Venha conhecer',
                roomId: sala.id,
                startTime: new Date('2026-10-05T08:00:00.000Z'),
                endTime: new Date('2026-10-05T17:00:00.000Z'),
                responsibleUserDataId: ana.id,
            },
        });
        await prisma.roomBooking.create({
            data: {
                type: 'MEETING',
                title: 'Reunião mensal',
                roomId: sala.id,
                startTime: new Date('2026-10-06T19:00:00.000Z'),
                endTime: new Date('2026-10-06T21:00:00.000Z'),
            },
        });
        salaId = sala.id;
    });

    it('catálogo: 200 com READ_COURSE, padrão de 8 colunas e só o Padrão; sem READ_COURSE, 403', async () => {
        const courseOnly = await adminWith('so.cursos.reservas', ['READ_COURSE']);
        const res = await get('/admin/export/room-bookings/catalog', courseOnly);
        expect(res.statusCode, res.body).toBe(200);
        const catalog = res.json() as Catalog;
        expect(catalog).toMatchObject({ dataset: 'room-bookings',
title: 'Reservas de sala',
modelos: [] });
        expect(catalog.padrao).toHaveLength(8);
        expect(catalog.groups.map(g => g.name)).toEqual(['Reserva', 'Quando e onde', 'Responsável', 'No site', 'Relatório']);
        expect(catalog.groups.flatMap(g => g.fields).find(f => f.key === 'responsible')).toMatchObject({ privacy: 'pessoal',
allowed: true });

        const userOnly = await adminWith('so.usuarios.reservas', ['READ_USER']);
        expect((await get('/admin/export/room-bookings/catalog', userOnly)).statusCode).toBe(403);
    });

    it('campos escolhidos com o período e a sala da Agenda, o PDF e a auditoria', async () => {
        const csv = await get(`/admin/export/room-bookings?from=2026-10-05&to=2026-10-11&roomId=${salaId}&fields=ordinal,title,startTime,publicOnSite,responsible`);
        expect(csv.statusCode, csv.body).toBe(200);
        expect(rows(csv.body)).toEqual([
            ['Nº de ordem', 'Título', 'Início', 'No site', 'Responsável'],
            ['1', 'Dia de campo', '05/10/2026 08:00', 'Sim', 'ANA RESPONSAVEL'],
            ['2', 'Reunião mensal', '06/10/2026 19:00', 'Não', ''],
        ]);
        expect((await lastExport())!.targetLabel).toBe('Reservas de sala: 2 registros (com filtros) · CSV · com Responsável');

        const pdf = await post('/admin/export/room-bookings', {
            fields: ['title', 'room'],
            format: 'pdf',
            from: '2026-10-05',
            to: '2026-10-05',
            roomId: salaId,
            type: 'EVENT',
        });
        expect(pdf.statusCode, pdf.body).toBe(200);
        expect(pdf.json()).toMatchObject({
            title: 'Reservas de sala',
            filename: `reservas-de-sala-${today()}.pdf`,
            count: 1,
            filters: 'Dia: 05/10/2026 · Sala: SALA MONTADOR · Tipo: Evento',
            rows: [['Dia de campo', 'SALA MONTADOR']],
        });
        const log = await lastExport();
        expect(log).toMatchObject({ path: '/admin/export/room-bookings',
targetLabel: 'Reservas de sala: 1 registro (com filtros) · PDF' });
        expect(log!.details).toMatchObject({
            formato: 'pdf',
            campos: ['Título', 'Sala'],
            filtros: [
                { nome: 'Dia',
valor: '05/10/2026' },
                { nome: 'Sala',
valor: 'SALA MONTADOR' },
                { nome: 'Tipo',
valor: 'Evento' },
            ],
        });
    });
});

describe('lançamentos do Financeiro', () => {
    let categoria: string;

    beforeAll(async () => {
        // O `cleanDatabase` não limpa o Financeiro.
        await prisma.$executeRawUnsafe(`
            TRUNCATE TABLE
                "FinanceMonthlyClosing", "FinancialAttachment", "FinancialTransaction",
                "FinanceRecurringTransaction", "FinancialCategory", "FinancialAccount", "FinancePaymentMethod"
            RESTART IDENTITY CASCADE
        `);
        const insumos = await prisma.financialCategory.create({ data: { name: 'INSUMOS MONTADOR',
type: 'OUT' } });
        const banco = await prisma.financialAccount.create({ data: { name: 'BANCO MONTADOR' } });
        await prisma.financialTransaction.create({
            data: {
                number: 10,
                type: 'OUT',
                amountCents: 150000,
                date: new Date('2026-05-10T00:00:00.000Z'),
                description: 'Compra de semente',
                method: 'PIX',
                categoryId: insumos.id,
                accountId: banco.id,
                empenho: { razaoSocial: 'JOSE DA SILVA',
cnpjCpf: '52998224725',
telefone: '44999998888',
descontoCents: 500 },
            },
        });
        await prisma.financialTransaction.create({
            data: {
                number: 11,
                type: 'IN',
                amountCents: 2000,
                date: new Date('2026-05-11T00:00:00.000Z'),
                description: 'Mensalidade',
                accountId: banco.id,
            },
        });
        categoria = insumos.id;
    });

    it('catálogo: 200 com READ_FINANCE, padrão de 13 colunas e o modelo Resumido; sem READ_FINANCE, 403', async () => {
        const financeOnly = await adminWith('so.financeiro', ['READ_FINANCE']);
        const res = await get('/admin/export/finance-transactions/catalog', financeOnly);
        expect(res.statusCode, res.body).toBe(200);
        const catalog = res.json() as Catalog;
        expect(catalog).toMatchObject({ dataset: 'finance-transactions',
title: 'Lançamentos' });
        expect(catalog.padrao).toHaveLength(13);
        expect(catalog.modelos.map(m => m.id)).toEqual(['resumido']);
        expect(catalog.groups.map(g => g.name)).toEqual(['Lançamento', 'Valores', 'Favorecido', 'Nota de Empenho', 'Sistema', 'Relatório']);
        // O filtro "Forma" da tela; a coluna continua "Método".
        expect(catalog.filterLabels).toMatchObject({ method: 'Forma de pagamento' });
        expect(catalog.groups.flatMap(g => g.fields).find(f => f.key === 'payeeDocument')).toMatchObject({ privacy: 'pessoal',
allowed: true });

        const userOnly = await adminWith('so.usuarios.financeiro', ['READ_USER']);
        expect((await get('/admin/export/finance-transactions/catalog', userOnly)).statusCode).toBe(403);
        expect((await get('/admin/export/finance-transactions', userOnly)).statusCode).toBe(403);
    });

    it('sem fields, o padrão de 13 colunas (o byte a byte está no teste de ouro), na auditoria', async () => {
        for (const query of ['', '?orderBy=number', `?categoryId=${categoria}`, '?search=jose', '?from=2026-05-11&to=2026-05-11']) {
            const motor = await get(`/admin/export/finance-transactions${query}`);
            expect(motor.statusCode, motor.body).toBe(200);
            expect(rows(motor.body)[0], query).toHaveLength(13);
            expect(motor.headers['content-disposition']).toBe(`attachment; filename="lancamentos-${today()}.csv"`);
        }
        const log = await prisma.auditLog.findFirst({ where: { method: 'EXPORT',
path: '/admin/export/finance-transactions' },
orderBy: { createdAt: 'desc' } });
        expect(log).toMatchObject({ targetLabel: 'Lançamentos: 1 registro (com filtros) · CSV · com CNPJ / CPF' });
        expect(log!.details).toMatchObject({ formato: 'csv',
modelo: 'Padrão (como hoje)',
filtros: [{ nome: 'Dia',
valor: '11/05/2026' }],
linhas: 1 });
    });

    it('campos escolhidos, PDF com o modelo Resumido e os filtros em palavras', async () => {
        const csv = await get('/admin/export/finance-transactions?fields=number,payeeName,payeeDocument,payeePhone,discount&orderBy=number');
        expect(csv.statusCode, csv.body).toBe(200);
        expect(rows(csv.body)).toEqual([
            ['Nº', 'Nome / Razão social', 'CNPJ / CPF', 'Telefone', 'Desconto (R$)'],
            ['11', '', '', '', ''],
            ['10', 'JOSE DA SILVA', '52998224725', '(44) 99999-8888', '5,00'],
        ]);

        const pdf = await post('/admin/export/finance-transactions', {
            fields: ['number', 'date', 'description', 'payeeName', 'amount'],
            format: 'pdf',
            modelo: 'resumido',
            categoryId: categoria,
            type: 'OUT',
        });
        expect(pdf.statusCode, pdf.body).toBe(200);
        expect(pdf.json()).toMatchObject({
            title: 'Lançamentos',
            filename: `lancamentos-${today()}.pdf`,
            filters: 'Tipo: Saída · Categoria: INSUMOS MONTADOR',
            modelo: 'Resumido',
            rows: [['10', '10/05/2026', 'Compra de semente', 'JOSE DA SILVA', '1.500,00']],
        });
        expect((await lastExport())!.targetLabel).toBe('Lançamentos: 1 registro (com filtros) · PDF');
    });
});

describe('CSV padrão dos lançamentos (GET /admin/export/finance-transactions)', () => {
    it('sem fields: as 13 colunas de sempre, o nome do arquivo com a data e a linha na auditoria', async () => {
        const res = await get('/admin/export/finance-transactions?orderBy=number&search=semente');
        expect(res.statusCode, res.body).toBe(200);
        expect(res.headers['content-disposition']).toBe(`attachment; filename="lancamentos-${today()}.csv"`);
        expect(res.headers['x-export-count']).toBe('1');
        expect(rows(res.body)[0]).toHaveLength(13);
        expect(rows(res.body)[1].slice(0, 6)).toEqual(['10', '10/05/2026', 'Saída', 'BANCO MONTADOR', 'INSUMOS MONTADOR', 'Compra de semente']);

        const log = await lastExport();
        expect(log).toMatchObject({
            path: '/admin/export/finance-transactions',
            entity: 'Exportação',
            targetLabel: 'Lançamentos: 1 registro (com filtros) · CSV · com CNPJ / CPF',
        });
        expect(log!.details).toMatchObject({
            formato: 'csv',
            modelo: 'Padrão (como hoje)',
            escopo: 'com filtros',
            filtros: [{ nome: 'Busca',
valor: 'semente' }, { nome: 'Ordem',
valor: 'Nº' }],
            linhas: 1,
        });
        // Aparece na lista da Auditoria como as outras exportações.
        const list = await get('/admin/audit-logs?action=export&limit=1');
        expect((list.json() as { data: { summary: string }[] }).data[0].summary).toBe(
            'Exportou a planilha "Lançamentos: 1 registro (com filtros) · CSV · com CNPJ / CPF"',
        );
    });

    it('sem READ_FINANCE → 403 e nenhuma linha; erro de filtro também não deixa linha', async () => {
        const userOnly = await adminWith('so.usuarios.csv.financeiro', ['READ_USER']);
        const before = await prisma.auditLog.count({ where: { method: 'EXPORT' } });
        expect((await get('/admin/export/finance-transactions', userOnly)).statusCode).toBe(403);
        const bad = await get('/admin/export/finance-transactions?from=ontem');
        expect(bad.statusCode).toBe(400);
        expect(bad.json()).toEqual({ error: 'Parâmetro inválido: from' });
        expect(await prisma.auditLog.count({ where: { method: 'EXPORT' } })).toBe(before);
    });
});

describe('rota antiga do CSV do Financeiro, apagada na SR-119', () => {
    it('GET /admin/finance/transactions/export → 404, com e sem token válido, e nenhuma linha na auditoria', async () => {
        const before = await prisma.auditLog.count({ where: { method: 'EXPORT' } });
        expect((await get('/admin/finance/transactions/export')).statusCode).toBe(404);
        expect((await get('/admin/finance/transactions/export', '')).statusCode).toBe(404);
        expect((await get('/admin/finance/transactions/export?orderBy=number', 'token-invalido')).statusCode).toBe(404);
        expect(await prisma.auditLog.count({ where: { method: 'EXPORT' } })).toBe(before);
    });
});
