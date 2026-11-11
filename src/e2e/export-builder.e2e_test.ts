import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hash } from 'bcrypt';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '../generated/prisma/client.js';
import { createTestApp } from './helpers/create-test-app.js';
import { createTestPrisma, cleanDatabase, seedSuperAdmin, loginAndGetToken, bearer } from './helpers/db.js';

// Montador de relatórios (decisão 006, fase 1): catálogo, campos escolhidos,
// PDF, permissão por campo, limites, fórmula no CSV, limite por minuto e a
// linha da auditoria.

let app: FastifyInstance;
let prisma: PrismaClient;
let token: string;
let courseOnly: string;
const ids: Record<string, string> = {};

function rows(body: string): string[][] {
    return body
        .replace(/^﻿/, '')
        .trim()
        .split('\r\n')
        .map(line => line.slice(1, -1).split('";"'));
}

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

beforeAll(async () => {
    prisma = createTestPrisma();
    await cleanDatabase(prisma);
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "AuditLog"');
    await seedSuperAdmin(prisma);
    app = await createTestApp(prisma);
    token = await loginAndGetToken(app);
    courseOnly = await adminWith('socursos', ['READ_COURSE']);

    const address = await prisma.address.create({
        data: { type: 'URBAN',
street: 'RUA X',
number: '10',
city: 'TERRA ROXA',
state: 'PR',
zipCode: '85990000' },
    });
    const ana = await prisma.userData.create({
        data: {
            name: 'ANA MONTADOR',
cpf: '52998224725',
email: 'ana@montador.test',
phone: '44911114001',
rg: '998877',
            memberNotes: '=HYPERLINK("http://mal")',
        },
    });
    const prop = await prisma.property.create({ data: { name: 'SEDE',
userDataId: ana.id,
addressId: address.id } });
    await prisma.userData.update({ where: { id: ana.id },
data: { primaryPropertyId: prop.id } });
    const bia = await prisma.userData.create({ data: { name: 'BIA MONTADOR',
phone: '(44) 3645-1234' } });

    const room = await prisma.room.create({ data: { name: 'SALA MONTADOR',
description: 'x',
maxCapacity: 10 } });
    const course = await prisma.course.create({
        data: {
            name: 'CURSO MONTADOR',
description: 'x',
roomId: room.id,
            startTime: new Date('2032-01-01T08:00:00Z'),
endTime: new Date('2032-01-01T12:00:00Z'),
        },
    });
    await prisma.courseUserRegistration.create({ data: { courseId: course.id,
userDataId: ana.id,
confirmed: true } });
    await prisma.courseUserRegistration.create({ data: { courseId: course.id,
userDataId: bia.id,
confirmed: false } });
    Object.assign(ids, { ana: ana.id,
bia: bia.id,
course: course.id });
});

afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
});

const get = (url: string, auth = token) => app.inject({ method: 'GET',
url,
headers: auth ? bearer(auth) : {} });
const post = (url: string, payload: object, auth = token) =>
    app.inject({ method: 'POST',
url,
headers: bearer(auth),
payload });

type Catalog = {
    dataset: string;
    title: string;
    groups: {
 name: string;
fields: {
 key: string;
label: string;
type: string;
privacy: string;
allowed: boolean;
reason: string | null 
}[] 
}[];
    padrao: string[];
    modelos: {
 id: string;
name: string;
fields: string[];
confirmed?: boolean 
}[];
    filterLabels: Record<string, string>;
    limits: {
 rows: number;
pdfRows: number;
fields: number 
};
};

describe('GET /admin/export/:dataset/catalog', () => {
    it('pessoas: grupos, campos com tipo e privacidade, padrão, modelos, filtros e limites', async () => {
        const res = await get('/admin/export/people/catalog');
        expect(res.statusCode, res.body).toBe(200);
        const catalog = res.json() as Catalog;
        expect(catalog).toMatchObject({
            dataset: 'people',
            title: 'Pessoas',
            limits: { rows: 20000,
pdfRows: 2000,
fields: 80 },
            filterLabels: { search: 'Busca',
activeMember: 'Só associados em dia' },
        });
        expect(catalog.groups.map(g => g.name)).toEqual([
            'Identificação', 'Documentos', 'Contato', 'Endereço', 'Associado', 'Vínculos', 'Sistema', 'Relatório',
        ]);
        const fields = catalog.groups.flatMap(g => g.fields);
        expect(fields.find(f => f.key === 'cpf')).toEqual({
            key: 'cpf',
label: 'CPF',
type: 'cpf',
privacy: 'pessoal',
allowed: true,
reason: null,
        });
        expect(catalog.padrao).toHaveLength(57);
        expect(catalog.modelos[0]).toEqual({ id: 'nome-cpf',
name: 'Nome e CPF',
fields: ['name', 'cpf'] });
    });

    it('inscrições com só READ_COURSE: os campos novos da pessoa vêm desligados, com o motivo', async () => {
        const res = await get('/admin/export/registrations/catalog', courseOnly);
        expect(res.statusCode, res.body).toBe(200);
        const catalog = res.json() as Catalog;
        const fields = catalog.groups.flatMap(g => g.fields);
        expect(fields.find(f => f.key === 'cpf')!.allowed).toBe(true);
        expect(fields.find(f => f.key === 'rg')).toMatchObject({ allowed: false,
reason: 'Pede a permissão Visualizar usuários' });
        expect(catalog.modelos.find(m => m.id === 'lista-presenca')).toEqual({
            id: 'lista-presenca',
name: 'Lista de presença',
fields: ['ordinal', 'name', 'cpf', 'signature'],
confirmed: true,
        });
    });

    it('conjunto sem montador → 404; sem permissão do conjunto → 403; sem token → 401; desconhecido → 400', async () => {
        // Todas as listas passaram ao montador na fase 2 (SR-100 e SR-102); o
        // relatório de cadastros, um retrato fixo de quatro conjuntos, não tem.
        const cadastros = await get('/admin/export/cadastros/catalog');
        expect(cadastros.statusCode).toBe(404);
        expect(cadastros.json()).toEqual({ error: 'Este conjunto ainda não tem o montador.' });
        expect((await get('/admin/export/people/catalog', courseOnly)).statusCode).toBe(403);
        expect((await get('/admin/export/people/catalog', '')).statusCode).toBe(401);
        expect((await get('/admin/export/senhas/catalog')).statusCode).toBe(400);
    });
});

describe('exportar com campos escolhidos', () => {
    it('GET com fields=a,b,c: as colunas na ordem pedida, telefone com máscara', async () => {
        const res = await get(`/admin/export/people?ids=${ids.ana},${ids.bia}&fields=ordinal,name,phone,cpf,addressLine`);
        expect(res.statusCode, res.body).toBe(200);
        expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
        expect(res.headers['x-export-count']).toBe('2');
        expect(rows(res.body)).toEqual([
            ['Nº de ordem', 'Nome', 'Telefone', 'CPF', 'Endereço numa linha'],
            ['1', 'ANA MONTADOR', '(44) 91111-4001', '529.982.247-25', 'RUA X, 10 - TERRA ROXA/PR - 85990-000'],
            ['2', 'BIA MONTADOR', '(44) 3645-1234', '', ''],
        ]);
    });

    it('POST com a lista no corpo e os filtros da tela', async () => {
        const res = await post('/admin/export/people', { search: 'montador',
fields: ['name', 'email'],
modelo: 'nome-email' });
        expect(res.statusCode, res.body).toBe(200);
        expect(rows(res.body)).toEqual([['Nome', 'E-mail'], ['ANA MONTADOR', 'ana@montador.test'], ['BIA MONTADOR', '']]);
    });

    it('fórmula continua neutralizada no CSV com campos escolhidos', async () => {
        const res = await get(`/admin/export/people?ids=${ids.ana}&fields=name,memberNotes`);
        expect(rows(res.body)[1]).toEqual(['ANA MONTADOR', `'=HYPERLINK(""http://mal"")`]);
    });

    it('PDF: JSON com colunas e linhas formatadas, sem o apóstrofo', async () => {
        const res = await post('/admin/export/people', {
            ids: [ids.ana],
            fields: ['name', 'cpf', 'memberNotes'],
            format: 'pdf',
            modelo: 'nome-cpf',
        });
        expect(res.statusCode, res.body).toBe(200);
        expect(res.headers['content-type']).toContain('application/json');
        expect(res.headers['x-export-count']).toBe('1');
        const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
        expect(res.json()).toEqual({
            title: 'Pessoas',
            filename: `pessoa-ana-montador-${today}.pdf`,
            count: 1,
            filters: 'Seleção: 1 registro',
            modelo: 'Nome e CPF',
            columns: [
                { key: 'name',
label: 'Nome',
type: 'text',
weight: 3 },
                { key: 'cpf',
label: 'CPF',
type: 'cpf',
weight: 2 },
                { key: 'memberNotes',
label: 'Observações',
type: 'text',
weight: 4 },
            ],
            rows: [['ANA MONTADOR', '529.982.247-25', '=HYPERLINK("http://mal")']],
        });
    });

    it('inscrições: "Só confirmadas" e a lista de presença', async () => {
        const res = await get(`/admin/export/registrations?courseIds=${ids.course}&confirmed=true&fields=ordinal,name,cpf,signature`, courseOnly);
        expect(res.statusCode, res.body).toBe(200);
        expect(rows(res.body)).toEqual([['Nº de ordem', 'Nome', 'CPF', 'Assinatura'], ['1', 'ANA MONTADOR', '529.982.247-25', '']]);
        const all = await get(`/admin/export/registrations?courseIds=${ids.course}&fields=name`, courseOnly);
        expect(all.headers['x-export-count']).toBe('2');
    });
});

describe('permissão por campo', () => {
    it('só com READ_COURSE: campo novo da pessoa nas inscrições → 403 com os rótulos', async () => {
        const res = await post('/admin/export/registrations', { courseIds: [ids.course],
fields: ['name', 'rg', 'addressCity'] }, courseOnly);
        expect(res.statusCode).toBe(403);
        expect(res.json()).toEqual({ error: 'Sem permissão para exportar: RG, Endereço: Cidade.' });
    });

    it('com READ_USER também, sai', async () => {
        const res = await post('/admin/export/registrations', { courseIds: [ids.course],
fields: ['name', 'rg'] });
        expect(res.statusCode, res.body).toBe(200);
        expect(rows(res.body)).toEqual([['Nome', 'RG'], ['ANA MONTADOR', '998877'], ['BIA MONTADOR', '']]);
    });

    it('os campos de sempre continuam com READ_COURSE (o padrão também)', async () => {
        const res = await get(`/admin/export/registrations?courseIds=${ids.course}&fields=name,cpf,email,phone,birthDate,age,activeMember,partnerCompanies,boardPosition,publicContact`, courseOnly);
        expect(res.statusCode, res.body).toBe(200);
        expect((await get(`/admin/export/registrations?courseIds=${ids.course}`, courseOnly)).statusCode).toBe(200);
    });
});

describe('erros e limites', () => {
    const cases: [string, string][] = [
        ['fields=', 'Escolha pelo menos um campo.'],
        ['fields=name,senha', 'Campo desconhecido: senha.'],
        ['fields=name,cpf,name', 'Campo repetido: Nome.'],
        [`fields=${Array.from({ length: 81 }, () => 'name').join(',')}`, 'No máximo 80 campos por relatório.'],
        ['format=xlsx', 'Formato inválido: use csv ou pdf.'],
    ];
    for (const [query, message] of cases) {
        it(`?${query.slice(0, 30)} → 400 "${message}"`, async () => {
            const res = await get(`/admin/export/people?${query}`);
            expect(res.statusCode).toBe(400);
            expect(res.json()).toEqual({ error: message });
        });
    }

    it('fields ou PDF num conjunto sem montador → 400', async () => {
        for (const query of ['fields=name', 'format=pdf']) {
            const res = await get(`/admin/export/cadastros?${query}`);
            expect(res.statusCode).toBe(400);
            expect(res.json()).toEqual({ error: 'Este conjunto ainda não tem o montador.' });
        }
        expect((await get('/admin/export/cadastros?format=csv')).statusCode).toBe(200);
    });

    it('PDF com mais de 2.000 linhas → 400; a planilha com as mesmas linhas sai', async () => {
        await prisma.userData.createMany({
            data: Array.from({ length: 2001 }, (_, i) => ({ name: `LOTE PDF ${String(i).padStart(5, '0')}`,
phone: '44900001111' })),
        });
        const pdf = await post('/admin/export/people', { search: 'lote pdf',
fields: ['name'],
format: 'pdf' });
        expect(pdf.statusCode).toBe(400);
        expect(pdf.json()).toEqual({ error: 'O PDF aceita até 2.000 linhas. Baixe a planilha ou use um filtro.' });
        const csv = await post('/admin/export/people', { search: 'lote pdf',
fields: ['name'] });
        expect(csv.statusCode).toBe(200);
        expect(csv.headers['x-export-count']).toBe('2001');
    });

    it('mais de 20.000 linhas → 400', async () => {
        await prisma.userData.createMany({
            data: Array.from({ length: 18000 }, (_, i) => ({ name: `LOTE GRANDE ${String(i).padStart(5, '0')}`,
phone: '44900002222' })),
        });
        // 2.001 + 18.000 + as pessoas do teste: passa de 20.000.
        const res = await post('/admin/export/people', { fields: ['name'] });
        expect(res.statusCode).toBe(400);
        expect(res.json()).toEqual({ error: 'O relatório passa de 20.000 linhas. Use um filtro para diminuir.' });
    });
});

describe('auditoria', () => {
    it('a linha diz o formato e os campos pessoais', async () => {
        await post('/admin/export/people', { ids: [ids.ana, ids.bia],
fields: ['name', 'phone', 'cpf'],
format: 'pdf' });
        const log = await prisma.auditLog.findFirst({ where: { method: 'EXPORT' },
orderBy: { createdAt: 'desc' } });
        expect(log).toMatchObject({
            path: '/admin/export/people',
            entity: 'Exportação',
            targetLabel: 'Pessoas: 2 registros (seleção) · PDF · com CPF, Telefone',
        });
        // O que foi exportado vai em `details`.
        expect(log!.details).toEqual({
            formato: 'pdf',
            modelo: null,
            campos: ['Nome', 'Telefone', 'CPF'],
            escopo: 'seleção',
            filtros: [{ nome: 'Seleção',
valor: '2 registros' }],
            linhas: 2,
        });
        // A busca da auditoria por "CPF" acha quem exportou CPF, e a lista devolve os detalhes.
        const found = await get('/admin/audit-logs?action=export&q=CPF');
        expect(found.statusCode).toBe(200);
        const row = (found.json() as {
 data: {
 targetLabel: string;
summary: string;
details: unknown
}[]
}).data[0];
        expect(row.targetLabel).toBe('Pessoas: 2 registros (seleção) · PDF · com CPF, Telefone');
        expect(row.details).toEqual(log!.details);
        // PDF não é planilha: a frase fala do relatório (a de CSV segue "Exportou a planilha").
        expect(row.summary).toBe('Exportou o relatório em PDF "Pessoas: 2 registros (seleção) · PDF · com CPF, Telefone"');
    });

    it('filtros e modelo nos detalhes; sem fields o modelo é o Padrão', async () => {
        await post('/admin/export/registrations', { courseIds: [ids.course],
confirmed: true,
modelo: 'lista-presenca',
fields: ['ordinal', 'name', 'cpf', 'signature'] });
        const lista = await prisma.auditLog.findFirst({ where: { method: 'EXPORT' },
orderBy: { createdAt: 'desc' } });
        expect(lista!.details).toEqual({
            formato: 'csv',
            modelo: 'Lista de presença',
            campos: ['Nº de ordem', 'Nome', 'CPF', 'Assinatura'],
            escopo: 'com filtros',
            filtros: [{ nome: 'Curso',
valor: 'CURSO MONTADOR' }, { nome: 'Só confirmadas',
valor: 'Sim' }],
            linhas: 1,
        });
        expect(lista!.targetLabel).toBe('Inscrições: 1 registro (com filtros) · CSV · com CPF');

        await get('/admin/export/people?search=montador');
        const padrao = await prisma.auditLog.findFirst({ where: { method: 'EXPORT' },
orderBy: { createdAt: 'desc' } });
        expect(padrao!.details).toMatchObject({ formato: 'csv',
modelo: 'Padrão (como hoje)',
escopo: 'com filtros',
linhas: 2 });
        expect((padrao!.details as { campos: string[] }).campos).toHaveLength(57);
    });

    it('tipo de membro nos filtros sai pelo rótulo das telas, no PDF e nos detalhes', async () => {
        const res = await post('/admin/export/people', { memberType: 'PRODUTOR RURAL',
fields: ['name'],
format: 'pdf' });
        expect(res.statusCode).toBe(200);
        expect(res.json()).toMatchObject({ filters: 'Tipo de membro: Produtor rural' });
        const log = await prisma.auditLog.findFirst({ where: { method: 'EXPORT' },
orderBy: { createdAt: 'desc' } });
        expect((log!.details as { filtros: unknown }).filtros).toEqual([{ nome: 'Tipo de membro',
valor: 'Produtor rural' }]);
    });

    it('curso sem nenhuma linha: o filtro diz o nome do curso no PDF e nos detalhes', async () => {
        // Curso só deste teste, sem inscrição; sai no fim para não mudar as contagens dos outros.
        const { roomId } = await prisma.course.findUniqueOrThrow({ where: { id: ids.course },
select: { roomId: true } });
        const vazio = await prisma.course.create({
            data: { name: 'Gestão da Propriedade Rural',
description: 'x',
roomId,
                startTime: new Date('2032-02-01T08:00:00Z'),
endTime: new Date('2032-02-01T12:00:00Z') },
        });
        try {
            const res = await post('/admin/export/registrations', { courseIds: [vazio.id],
confirmed: true,
modelo: 'lista-presenca',
fields: ['ordinal', 'name', 'cpf', 'signature'],
format: 'pdf' }, courseOnly);
            expect(res.statusCode).toBe(200);
            expect(res.json()).toMatchObject({ count: 0,
filters: 'Curso: Gestão da Propriedade Rural · Só confirmadas',
rows: [] });
            const log = await prisma.auditLog.findFirst({ where: { method: 'EXPORT' },
orderBy: { createdAt: 'desc' } });
            expect((log!.details as { filtros: unknown }).filtros).toEqual([
                { nome: 'Curso',
valor: 'Gestão da Propriedade Rural' },
                { nome: 'Só confirmadas',
valor: 'Sim' },
            ]);
        } finally {
            await prisma.course.delete({ where: { id: vazio.id } });
        }
    });

    it('conjunto ainda sem montador: linha como antes, sem detalhes', async () => {
        await get('/admin/export/cadastros');
        const log = await prisma.auditLog.findFirst({ where: { method: 'EXPORT' },
orderBy: { createdAt: 'desc' } });
        expect(log).toMatchObject({ path: '/admin/export/cadastros',
details: null });
        expect(log!.targetLabel).toMatch(/^Relatório de cadastros: \d+ registros \(todos\)$/);
        const list = await get('/admin/audit-logs?action=export&limit=1');
        expect((list.json() as { data: { details: unknown }[] }).data[0].details).toBeNull();
    });

    it('erro de campo não deixa linha', async () => {
        const before = await prisma.auditLog.count({ where: { method: 'EXPORT' } });
        await get('/admin/export/people?fields=senha');
        expect(await prisma.auditLog.count({ where: { method: 'EXPORT' } })).toBe(before);
    });
});

describe('limite por minuto', () => {
    it('30 exportações por minuto por IP; a 31ª → 429', async () => {
        const limited = await createTestApp(prisma, { rateLimit: true });
        try {
            const url = `/admin/export/people?ids=${ids.bia}&fields=name`;
            for (let i = 0; i < 30; i++) {
                const res = await limited.inject({ method: 'GET',
url,
headers: bearer(token) });
                expect(res.statusCode, `pedido ${i + 1}`).toBe(200);
            }
            const blocked = await limited.inject({ method: 'GET',
url,
headers: bearer(token) });
            expect(blocked.statusCode).toBe(429);
            expect(blocked.json()).toEqual({ error: 'Muitas exportações seguidas. Aguarde um minuto e tente de novo.' });
            // O catálogo não entra na conta.
            expect((await limited.inject({ method: 'GET',
url: '/admin/export/people/catalog',
headers: bearer(token) })).statusCode).toBe(200);
        } finally {
            await limited.close();
        }
    });
});
