import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hash } from 'bcrypt';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '../generated/prisma/client.js';
import { createTestApp } from './helpers/create-test-app.js';
import { createTestPrisma, cleanDatabase, seedSuperAdmin, loginAndGetToken, bearer } from './helpers/db.js';

// Montador de relatórios, fase 2 (decisão 006): as fontes que saíram do
// caminho antigo respondem o catálogo, aceitam campos e PDF e gravam o que
// saiu na auditoria. O padrão de cada uma é o teste de ouro
// (`export-golden-fase2.e2e_test.ts`).

let app: FastifyInstance;
let prisma: PrismaClient;
let token: string;
const ids: Record<string, string> = {};

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
allowed: boolean;
reason: string | null 
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
    await seedSuperAdmin(prisma);
    app = await createTestApp(prisma);
    token = await loginAndGetToken(app);

    const sede = await prisma.address.create({
        data: { type: 'URBAN',
street: 'RUA X',
number: '10',
city: 'TERRA ROXA',
state: 'PR',
zipCode: '85990000' },
    });
    const agro = await prisma.company.create({
        data: { name: 'AGRO MONTADOR LTDA',
tradeName: 'AGRO MONTADOR',
cnpj: '11222333000181',
phone: '4436451234',
isPartner: true,
addressId: sede.id },
    });
    await prisma.company.create({ data: { name: 'COOP MONTADOR',
type: 'PUBLIC' } });
    Object.assign(ids, { agro: agro.id });
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

describe('empresas', () => {
    it('catálogo: 200, com os grupos, o padrão e os modelos', async () => {
        const res = await get('/admin/export/companies/catalog');
        expect(res.statusCode, res.body).toBe(200);
        const catalog = res.json() as Catalog;
        expect(catalog.title).toBe('Empresas');
        expect(catalog.groups.map(g => g.name)).toEqual(['Empresa', 'Contato', 'Sede', 'Vínculos', 'Parceria', 'Sistema', 'Relatório']);
        expect(catalog.padrao).toHaveLength(30);
        expect(catalog.modelos.map(m => m.id)).toEqual(['razao-social-cnpj', 'contato']);
        expect(catalog.filterLabels).toEqual({ search: 'Busca',
type: 'Tipo',
isPartner: 'Só parceiras' });
        // Sem READ_USER, nem o catálogo.
        const semUsuarios = await adminWith('emp_cursos', ['READ_COURSE']);
        expect((await get('/admin/export/companies/catalog', semUsuarios)).statusCode).toBe(403);
    });

    it('campos escolhidos com os filtros da tela, e o PDF', async () => {
        const csv = await get('/admin/export/companies?search=montador&isPartner=true&fields=name,cnpj,phone,addressLine');
        expect(csv.statusCode, csv.body).toBe(200);
        expect(rows(csv.body)).toEqual([
            ['Razão social', 'CNPJ', 'Telefone', 'Sede numa linha'],
            ['AGRO MONTADOR LTDA', '11.222.333/0001-81', '(44) 3645-1234', 'RUA X, 10 - TERRA ROXA/PR - 85990-000'],
        ]);

        const pdf = await post('/admin/export/companies', { ids: [ids.agro],
fields: ['name', 'cnpj'],
format: 'pdf',
modelo: 'razao-social-cnpj' });
        expect(pdf.statusCode, pdf.body).toBe(200);
        expect(pdf.json()).toEqual({
            title: 'Empresas',
            filename: `empresa-agro-montador-${today()}.pdf`,
            count: 1,
            filters: 'Seleção: 1 registro',
            modelo: 'Razão social e CNPJ',
            columns: [
                { key: 'name',
label: 'Razão social',
type: 'text',
weight: 3 },
                { key: 'cnpj',
label: 'CNPJ',
type: 'cnpj',
weight: 2.5 },
            ],
            rows: [['AGRO MONTADOR LTDA', '11.222.333/0001-81']],
        });
    });

    it('auditoria com os detalhes; campo desconhecido → 400', async () => {
        await post('/admin/export/companies', { type: 'PUBLIC',
fields: ['name', 'email'] });
        const log = await lastExport();
        expect(log).toMatchObject({ path: '/admin/export/companies',
targetLabel: 'Empresas: 1 registro (com filtros) · CSV · com E-mail' });
        expect(log!.details).toEqual({
            formato: 'csv',
            modelo: null,
            campos: ['Razão social', 'E-mail'],
            escopo: 'com filtros',
            filtros: [{ nome: 'Tipo',
valor: 'Pública' }],
            linhas: 1,
        });
        const bad = await get('/admin/export/companies?fields=name,cpf');
        expect(bad.statusCode).toBe(400);
        expect(bad.json()).toEqual({ error: 'Campo desconhecido: cpf.' });
    });
});

describe('propriedades', () => {
    beforeAll(async () => {
        const address = await prisma.address.create({
            data: { type: 'RURAL',
road: 'ESTRADA BOIADEIRA',
km: '12',
city: 'TERRA ROXA',
state: 'PR',
zipCode: '85990000' },
        });
        const dono = await prisma.userData.create({ data: { name: 'DONO MONTADOR',
cpf: '52998224725',
phone: '44911117001' } });
        await prisma.property.create({ data: { name: 'SITIO MONTADOR',
userDataId: dono.id,
addressId: address.id } });
        await prisma.property.create({ data: { name: 'FAZENDA DA AGRO',
companyId: ids.agro,
addressId: address.id } });
        ids.dono = dono.id;
    });

    it('catálogo: 200, padrão de 21 colunas e só o Padrão', async () => {
        const res = await get('/admin/export/properties/catalog');
        expect(res.statusCode, res.body).toBe(200);
        const catalog = res.json() as Catalog;
        expect(catalog).toMatchObject({ dataset: 'properties',
title: 'Propriedades',
modelos: [],
filterLabels: { ownerIds: 'Donos' } });
        expect(catalog.padrao).toHaveLength(21);
    });

    it('campos escolhidos, PDF com os donos pelo nome e a auditoria', async () => {
        const csv = await post('/admin/export/properties', { ownerIds: [ids.dono, ids.agro],
fields: ['name', 'ownerName', 'ownerDocument'] });
        expect(csv.statusCode, csv.body).toBe(200);
        expect(rows(csv.body)).toEqual([
            ['Propriedade', 'Nome do dono', 'CPF/CNPJ'],
            ['SITIO MONTADOR', 'DONO MONTADOR', '529.982.247-25'],
            ['FAZENDA DA AGRO', 'AGRO MONTADOR', '11.222.333/0001-81'],
        ]);
        expect((await lastExport())!.details).toMatchObject({ campos: ['Propriedade', 'Nome do dono', 'CPF/CNPJ'],
escopo: 'com filtros',
linhas: 2 });

        const pdf = await post('/admin/export/properties', { ownerIds: [ids.dono],
fields: ['ordinal', 'name', 'addressLine'],
format: 'pdf' });
        expect(pdf.statusCode, pdf.body).toBe(200);
        expect(pdf.json()).toMatchObject({
            title: 'Propriedades',
            filters: 'Dono: DONO MONTADOR',
            rows: [['1', 'SITIO MONTADOR', 'ESTRADA BOIADEIRA - km 12 - TERRA ROXA/PR - 85990-000']],
        });
    });
});
