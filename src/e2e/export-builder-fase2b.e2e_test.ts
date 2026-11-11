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
        expect(catalog.filterLabels).toMatchObject({ action: 'Ação',
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
            filters: `Ação: Exportações · Quem: e2eadmin · Período: 01/01/2020 a ${today().split('-').reverse().join('/')}`,
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
