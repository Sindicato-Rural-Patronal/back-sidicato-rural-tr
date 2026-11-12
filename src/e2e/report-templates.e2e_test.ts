import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hash } from 'bcrypt';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { Permission } from '../generated/prisma/enums.js';
import { createTestApp } from './helpers/create-test-app.js';
import { createTestPrisma, cleanDatabase, seedSuperAdmin, loginAndGetToken, bearer } from './helpers/db.js';

// Modelos de relatório da equipe (decisão 006, fase 3, SR-114): as rotas
// /admin/report-templates/:dataset, a validação contra o catálogo, a permissão
// do conjunto e por campo, o nome único entre os ativos (índice parcial do
// banco), o soft-delete, o campo que saiu do catálogo, a auditoria pelo hook
// geral e a exportação com o nome do modelo.

type Template = {
    id: string;
    dataset: string;
    name: string;
    fields: string[];
    missingFields: string[];
    format: string | null;
    confirmed: boolean | null;
    createdAt: string;
    updatedAt: string;
    createdBy: {
        id: string;
        username: string | null;
    };
    updatedBy: {
        id: string;
        username: string | null;
    } | null;
};

let app: FastifyInstance;
let prisma: PrismaClient;
let superToken: string;
let superId: string;
let courseOnly: string;
let userOnly: string;

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

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';
const call = (method: Method, url: string, payload?: object, token: string | null = superToken) =>
    app.inject({
        method,
        url,
        headers: token ? bearer(token) : {},
        ...(payload !== undefined && { payload }),
    });

const base = (dataset: string) => `/admin/report-templates/${dataset}`;
const list = async (dataset: string, token = superToken) => {
    const res = await call('GET', base(dataset), undefined, token);
    expect(res.statusCode, res.body).toBe(200);
    return res.json() as Template[];
};
const create = async (dataset: string, body: object, token = superToken) => {
    const res = await call('POST', base(dataset), body, token);
    expect(res.statusCode, res.body).toBe(201);
    return res.json() as Template;
};

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

beforeAll(async () => {
    prisma = createTestPrisma();
    await cleanDatabase(prisma);
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "AuditLog"');
    const { userAdmin } = await seedSuperAdmin(prisma);
    superId = userAdmin.id;
    app = await createTestApp(prisma);
    superToken = await loginAndGetToken(app);
    courseOnly = await adminWith('modelo.cursos', ['READ_COURSE']);
    userOnly = await adminWith('modelo.usuarios', ['READ_USER']);
});

afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
});

describe('salvar e listar', () => {
    it('POST → 201 com o modelo; GET lista os da equipe pelo nome, com quem criou', async () => {
        const created = await create('people', { name: '  Só os   nomes ',
fields: ['name', 'cpf', 'email'],
format: 'pdf' });
        expect(created).toMatchObject({
            dataset: 'people',
            name: 'Só os nomes',
            fields: ['name', 'cpf', 'email'],
            missingFields: [],
            format: 'pdf',
            confirmed: null,
            createdBy: { id: superId,
username: 'e2eadmin' },
            updatedBy: null,
        });
        expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
        expect(Number.isNaN(Date.parse(created.createdAt))).toBe(false);

        await create('people', { name: 'Aniversariantes',
fields: ['name', 'birthDate', 'age'] }, userOnly);
        const rows = await list('people', userOnly);
        expect(rows.map(t => t.name)).toEqual(['Aniversariantes', 'Só os nomes']);
        expect(rows[0]).toMatchObject({ format: null,
createdBy: { username: 'modelo.usuarios' } });
        // Outro relatório não vê.
        expect(await list('companies')).toEqual([]);
    });

    it('inscrições: "Só confirmadas" é gravado (false sem ele)', async () => {
        const on = await create('registrations', { name: 'Presença do dia',
fields: ['ordinal', 'name', 'cpf', 'signature'],
confirmed: true }, courseOnly);
        const off = await create('registrations', { name: 'Todos os inscritos',
fields: ['name', 'phone'] }, courseOnly);
        expect(on.confirmed).toBe(true);
        expect(off.confirmed).toBe(false);
    });

    it.each([
        [{ fields: ['name'] }, 'Informe o nome do modelo.'],
        [{ name: 'x'.repeat(65),
fields: ['name'] }, 'O nome do modelo pode ter até 64 caracteres.'],
        [{ name: 'Sem campos' }, 'Escolha pelo menos um campo.'],
        [{ name: 'Vazio',
fields: [] }, 'Escolha pelo menos um campo.'],
        [{ name: 'Desconhecido',
fields: ['name', 'senha'] }, 'Campo desconhecido: senha.'],
        [{ name: 'Repetido',
fields: ['cpf', 'name', 'cpf'] }, 'Campo repetido: CPF.'],
        [{ name: 'Demais',
fields: Array.from({ length: 81 }, () => 'name') }, 'No máximo 80 campos por relatório.'],
        [{ name: 'Formato',
fields: ['name'],
format: 'docx' }, 'Formato inválido: use csv, pdf ou xlsx.'],
    ])('400: %j → %s', async (body, message) => {
        const res = await call('POST', base('people'), body);
        expect(res.statusCode, res.body).toBe(400);
        expect(res.json()).toEqual({ error: message });
    });

    it('409 com nome repetido no relatório (sem diferenciar maiúsculas) ou de modelo de fábrica; em outro relatório pode', async () => {
        const dup = await call('POST', base('people'), { name: 'SÓ OS NOMES',
fields: ['name'] });
        expect(dup.statusCode).toBe(409);
        expect(dup.json()).toEqual({ error: 'Já existe um modelo da equipe com esse nome.' });

        const factory = await call('POST', base('people'), { name: 'nome e cpf',
fields: ['name', 'cpf'] });
        expect(factory.statusCode).toBe(409);
        expect(factory.json()).toEqual({ error: 'Já existe um modelo de fábrica com esse nome.' });

        await create('unimed', { name: 'Só os nomes',
fields: ['name'] });
    });

    it('dois pedidos com o mesmo nome ao mesmo tempo: o índice parcial deixa um só (201 e 409)', async () => {
        const [a, b] = await Promise.all([
            call('POST', base('companies'), { name: 'Corrida',
fields: ['name'] }),
            call('POST', base('companies'), { name: 'CORRIDA',
fields: ['cnpj'] }),
        ]);
        expect([a.statusCode, b.statusCode].sort()).toEqual([201, 409]);
        expect((a.statusCode === 409 ? a : b).json()).toEqual({ error: 'Já existe um modelo da equipe com esse nome.' });
        expect(await prisma.reportTemplate.count({ where: { dataset: 'companies',
isDeleted: false } })).toBe(1);
    });

    it('o banco recusa o mesmo nome entre os ativos e aceita entre os excluídos', async () => {
        const data = { dataset: 'courses',
name: 'Banco',
fields: ['name'],
createdById: superId };
        await prisma.reportTemplate.create({ data });
        await expect(prisma.reportTemplate.create({ data: { ...data,
name: 'BANCO' } })).rejects.toMatchObject({ code: 'P2002' });
        await prisma.reportTemplate.create({ data: { ...data,
isDeleted: true,
deletedAt: new Date() } });
        await prisma.reportTemplate.create({ data: { ...data,
dataset: 'admins' } });
    });
});

describe('permissão', () => {
    it('ver e salvar pedem a permissão de exportar o conjunto (403 Forbidden); sem token, 401', async () => {
        expect((await call('GET', base('people'), undefined, courseOnly)).statusCode).toBe(403);
        expect((await call('GET', base('registrations'), undefined, userOnly)).json()).toEqual({ error: 'Forbidden' });
        expect((await call('POST', base('people'), { name: 'X',
fields: ['name'] }, courseOnly)).statusCode).toBe(403);
        expect((await call('GET', base('people'), undefined, null)).statusCode).toBe(401);
    });

    it('salvar com campo que quem pede não pode exportar → 403 com os rótulos, como na exportação', async () => {
        const res = await call('POST', base('registrations'), { name: 'Ficha',
fields: ['name', 'rg', 'addressCity'] }, courseOnly);
        expect(res.statusCode).toBe(403);
        expect(res.json()).toEqual({ error: 'Sem permissão para exportar: RG, Endereço: Cidade.' });
        expect(await prisma.reportTemplate.count({ where: { name: 'Ficha' } })).toBe(0);
    });

    it('o modelo com campo sem permissão aparece para quem lista, com as chaves (o montador tira pelo catálogo)', async () => {
        await create('registrations', { name: 'Ficha completa',
fields: ['name', 'cpf', 'rg'] });
        const ficha = (await list('registrations', courseOnly)).find(t => t.name === 'Ficha completa');
        expect(ficha).toMatchObject({ fields: ['name', 'cpf', 'rg'],
missingFields: [] });
    });

    it('quem não pode exportar algum campo do modelo não o muda nem o exclui', async () => {
        const ficha = (await list('registrations')).find(t => t.name === 'Ficha completa')!;
        const message = { error: 'Este modelo tem campos que você não pode exportar: RG.' };
        const rename = await call('PATCH', `${base('registrations')}/${ficha.id}`, { name: 'Outra' }, courseOnly);
        expect(rename.statusCode).toBe(403);
        expect(rename.json()).toEqual(message);
        const remove = await call('DELETE', `${base('registrations')}/${ficha.id}`, undefined, courseOnly);
        expect(remove.statusCode).toBe(403);
        expect(remove.json()).toEqual(message);
        expect(await prisma.reportTemplate.findUnique({ where: { id: ficha.id } })).toMatchObject({ name: 'Ficha completa',
isDeleted: false });
    });

    it('conjunto sem montador → 404, como o catálogo; conjunto desconhecido → 400', async () => {
        for (const [method, payload] of [['GET', undefined], ['POST', { name: 'X',
fields: ['name'] }]] as const) {
            const res = await call(method, base('cadastros'), payload);
            expect(res.statusCode).toBe(404);
            expect(res.json()).toEqual({ error: 'Este conjunto ainda não tem o montador.' });
        }
        expect((await call('GET', base('nao-existe'))).statusCode).toBe(400);
    });
});

describe('renomear, mudar e excluir', () => {
    it('PATCH muda só o que veio → 200; a auditoria tem o nome antigo no alvo e o que mudou', async () => {
        const t = await create('people', { name: 'Contatos',
fields: ['name', 'phone'],
format: 'csv' });
        const res = await call('PATCH', `${base('people')}/${t.id}`, { name: 'Telefones da equipe' }, userOnly);
        expect(res.statusCode, res.body).toBe(200);
        expect(res.json()).toMatchObject({
            id: t.id,
            name: 'Telefones da equipe',
            fields: ['name', 'phone'],
            format: 'csv',
            updatedBy: { username: 'modelo.usuarios' },
        });
        const log = await waitForAudit({ method: 'PATCH',
path: `/admin/report-templates/people/${t.id}` });
        expect(log).toMatchObject({
            entity: 'Modelo de relatório',
            targetLabel: 'Pessoas: Telefones da equipe (antes Contatos)',
            statusCode: 200,
        });
        expect(log.changes).toEqual([{ field: 'name',
before: 'Contatos',
after: 'Telefones da equipe' }]);

        const fields = await call('PATCH', `${base('people')}/${t.id}`, { fields: ['phone', 'name', 'cpf'],
format: null });
        expect(fields.statusCode, fields.body).toBe(200);
        expect(fields.json()).toMatchObject({ fields: ['phone', 'name', 'cpf'],
format: null });
        await new Promise(r => setTimeout(r, 100));
        const second = await waitForAudit({ method: 'PATCH',
targetLabel: 'Pessoas: Telefones da equipe' });
        expect(second.changes).toEqual([
            { field: 'fields',
before: 'Nome, Telefone',
after: 'Telefone, Nome, CPF' },
            { field: 'format',
before: 'CSV',
after: null },
        ]);
    });

    it('PATCH: 400 sem nada para mudar, 404 de outro relatório ou inexistente, 409 com nome de outro', async () => {
        const t = await create('people', { name: 'Para mudar',
fields: ['name'] });
        const empty = await call('PATCH', `${base('people')}/${t.id}`, {});
        expect(empty.statusCode).toBe(400);
        expect(empty.json()).toEqual({ error: 'Nada para alterar.' });
        const other = await call('PATCH', `${base('companies')}/${t.id}`, { name: 'Y' });
        expect(other.statusCode).toBe(404);
        expect(other.json()).toEqual({ error: 'Modelo não encontrado.' });
        expect((await call('PATCH', `${base('people')}/${randomUUID()}`, { name: 'Y' })).statusCode).toBe(404);
        const taken = await call('PATCH', `${base('people')}/${t.id}`, { name: 'aniversariantes' });
        expect(taken.statusCode).toBe(409);
        expect(taken.json()).toEqual({ error: 'Já existe um modelo da equipe com esse nome.' });
    });

    it('DELETE → 204 (soft): sai da lista, a linha fica no banco, o nome fica livre e a auditoria guarda o que havia', async () => {
        const t = await create('people', { name: 'Temporário',
fields: ['name', 'cpf'],
format: 'xlsx' });
        const res = await call('DELETE', `${base('people')}/${t.id}`, undefined, userOnly);
        expect(res.statusCode, res.body).toBe(204);
        expect((await list('people')).some(x => x.id === t.id)).toBe(false);

        const row = await prisma.reportTemplate.findUniqueOrThrow({ where: { id: t.id } });
        expect(row.isDeleted).toBe(true);
        expect(row.deletedAt).toBeInstanceOf(Date);
        expect(row.updatedById).not.toBe(row.createdById);

        const log = await waitForAudit({ method: 'DELETE',
path: `/admin/report-templates/people/${t.id}` });
        expect(log).toMatchObject({ entity: 'Modelo de relatório',
targetLabel: 'Pessoas: Temporário',
statusCode: 204 });
        expect(log.changes).toEqual([
            { field: 'name',
before: 'Temporário',
after: null },
            { field: 'fields',
before: 'Nome, CPF',
after: null },
            { field: 'format',
before: 'Excel',
after: null },
        ]);

        const again = await call('DELETE', `${base('people')}/${t.id}`);
        expect(again.statusCode).toBe(404);
        expect(again.json()).toEqual({ error: 'Modelo não encontrado.' });
        expect((await call('PATCH', `${base('people')}/${t.id}`, { name: 'Volta' })).statusCode).toBe(404);
        await create('people', { name: 'temporário',
fields: ['name'] });
    });

    it('campo que saiu do catálogo: a lista devolve só os que existem e marca os que sumiram', async () => {
        const row = await prisma.reportTemplate.create({
            data: { dataset: 'contact-messages',
name: 'Antigo',
fields: ['name', 'campoQueSaiu', 'email'],
createdById: superId },
        });
        const [t] = await list('contact-messages');
        expect(t).toMatchObject({ id: row.id,
fields: ['name', 'email'],
missingFields: ['campoQueSaiu'] });
    });
});

describe('na auditoria e na exportação', () => {
    it('criar entra na trilha pelo hook geral: entidade, alvo e frase na tela da Auditoria', async () => {
        await create('room-bookings', { name: 'Agenda curta',
fields: ['title', 'room', 'startTime'] });
        await waitForAudit({ method: 'POST',
path: '/admin/report-templates/room-bookings' });
        const res = await call('GET', `/admin/audit-logs?entity=${encodeURIComponent('Modelo de relatório')}&q=${encodeURIComponent('Agenda curta')}`);
        expect(res.statusCode, res.body).toBe(200);
        const rows = (res.json() as {
 data: {
            summary: string;
            entity: string;
            actorName: string;
        }[] 
}).data;
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            entity: 'Modelo de relatório',
            summary: 'Criou o modelo de relatório "Reservas de sala: Agenda curta"',
            actorName: 'e2eadmin',
        });
    });

    it('listar não deixa linha; pedido com erro também não', async () => {
        const before = await prisma.auditLog.count({ where: { entity: 'Modelo de relatório' } });
        await list('people');
        await call('POST', base('people'), { name: 'Só os nomes',
fields: ['name'] });
        await new Promise(r => setTimeout(r, 200));
        expect(await prisma.auditLog.count({ where: { entity: 'Modelo de relatório' } })).toBe(before);
    });

    it('exportar com um modelo da equipe: o nome vai no `modelo`, no PDF e na auditoria', async () => {
        await prisma.userData.create({ data: { name: 'ANA MODELO',
phone: '44999990000',
cpf: '52998224725' } });
        const [t] = (await list('people')).filter(x => x.name === 'Só os nomes');
        const res = await call('POST', '/admin/export/people', {
            fields: t.fields,
            format: 'pdf',
            modelo: t.name,
            search: 'ana modelo',
        });
        expect(res.statusCode, res.body).toBe(200);
        expect(res.json()).toMatchObject({ modelo: 'Só os nomes',
count: 1 });
        const log = await waitForAudit({ method: 'EXPORT',
path: '/admin/export/people' });
        expect(log.details).toMatchObject({ formato: 'pdf',
modelo: 'Só os nomes',
campos: ['Nome', 'CPF', 'E-mail'] });
    });
});
