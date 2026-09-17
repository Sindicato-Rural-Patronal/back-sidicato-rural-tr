import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hash } from 'bcrypt';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '../generated/prisma/client.js';
import { createTestApp } from './helpers/create-test-app.js';
import { createTestPrisma, cleanDatabase, seedSuperAdmin, loginAndGetToken, bearer } from './helpers/db.js';

// Exportação CSV: filtros da listagem, seleção por ids, permissão e auditoria.

let app: FastifyInstance;
let prisma: PrismaClient;
let token: string;
const ids: Record<string, string> = {};

/** Linhas do CSV (sem BOM), células sem as aspas. */
function rows(body: string): string[][] {
    return body
        .replace(/^﻿/, '')
        .trim()
        .split('\r\n')
        .map(line => line.slice(1, -1).split('";"'));
}

beforeAll(async () => {
    prisma = createTestPrisma();
    await cleanDatabase(prisma);
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "AuditLog"');
    await seedSuperAdmin(prisma);
    app = await createTestApp(prisma);
    token = await loginAndGetToken(app);

    const ana = await prisma.userData.create({
        data: { name: 'ANA EXPORTA',
email: 'ana.exp@test.com',
phone: '44911113001',
cpf: '52998224725',
gender: 'FEMALE' },
    });
    const bruno = await prisma.userData.create({
        data: { name: 'BRUNO EXPORTA',
email: 'bruno.exp@test.com',
phone: '44911113002',
memberNotes: '=HYPERLINK("x")' },
    });
    const company = await prisma.company.create({ data: { name: 'AGRO EXPORT LTDA',
tradeName: 'AGRO EXPORT',
cnpj: '11222333000181' } });
    await prisma.companyMember.create({ data: { companyId: company.id,
userDataId: ana.id,
title: 'SOCIO' } });
    const address = await prisma.address.create({ data: { type: 'RURAL',
city: 'TERRA ROXA',
state: 'PR',
zipCode: '85990000' } });
    await prisma.property.create({ data: { name: 'SITIO DA ANA',
userDataId: ana.id,
addressId: address.id } });
    const room = await prisma.room.create({ data: { name: 'SALA APL',
description: 'x',
maxCapacity: 10 } });
    const course = await prisma.course.create({
        data: { name: 'CURSO EXPORT',
description: 'x',
roomId: room.id,
startTime: new Date('2032-01-01T11:00:00Z'),
endTime: new Date('2032-01-01T15:00:00Z') },
    });
    await prisma.courseUserRegistration.create({ data: { courseId: course.id,
userDataId: ana.id,
confirmed: true } });
    Object.assign(ids, { ana: ana.id,
bruno: bruno.id,
company: company.id,
course: course.id });

    // Admin só com cursos, para o 403.
    const rule = await prisma.rule.create({ data: { name: 'SO_CURSOS',
description: 'x',
permissions: ['READ_COURSE'] } });
    const person = await prisma.userData.create({ data: { name: 'SO CURSOS',
email: 'socursos@test.com',
phone: '44911113003' } });
    await prisma.userAdmin.create({
        data: { username: 'socursos',
passwordHash: await hash('SoCursos123!', 4),
userDataId: person.id,
rulesId: rule.id },
    });
});

afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
});

const get = (url: string, auth = token) => app.inject({ method: 'GET',
url,
headers: auth ? bearer(auth) : {} });

describe('Exportação CSV', () => {
    it('pessoas com filtro da listagem: planilha, nome do arquivo e fórmula neutralizada', async () => {
        const res = await get('/admin/export/people?search=exporta');
        expect(res.statusCode, res.body).toBe(200);
        expect(res.headers['content-type']).toContain('text/csv');
        expect(res.headers['content-disposition']).toMatch(/attachment; filename="pessoas-\d{4}-\d{2}-\d{2}\.csv"/);
        expect(res.headers['x-export-count']).toBe('2');
        expect(res.body.startsWith('﻿')).toBe(true);

        const [header, ...data] = rows(res.body);
        expect(data.map(r => r[header.indexOf('Nome')])).toEqual(['ANA EXPORTA', 'BRUNO EXPORTA']);
        const ana = data[0];
        expect(ana[header.indexOf('CPF')]).toBe('529.982.247-25');
        expect(ana[header.indexOf('Sexo')]).toBe('Feminino');
        expect(ana[header.indexOf('Empresas vinculadas')]).toBe('AGRO EXPORT (SOCIO)');
        expect(ana[header.indexOf('Endereço: CEP')]).toBe('85990-000');
        expect(ana[header.indexOf('Inscrições em cursos')]).toBe('1');
        expect(data[1][header.indexOf('Observações')]).toBe(`'=HYPERLINK(""x"")`);
    });

    it('um registro pelo id (individual) e vários selecionados', async () => {
        const one = await get(`/admin/export/people?ids=${ids.bruno}`);
        expect(one.statusCode).toBe(200);
        expect(one.headers['content-disposition']).toContain('filename="pessoa-bruno-exporta-');
        expect(rows(one.body)).toHaveLength(2);

        const many = await get(`/admin/export/people?ids=${ids.ana},${ids.bruno}`);
        expect(many.headers['x-export-count']).toBe('2');
    });

    it('empresas, propriedades da pessoa e inscrições do curso', async () => {
        const companies = rows((await get(`/admin/export/companies?ids=${ids.company}`)).body);
        expect(companies[1][companies[0].indexOf('CNPJ')]).toBe('11.222.333/0001-81');
        expect(companies[1][companies[0].indexOf('Pessoas vinculadas')]).toBe('ANA EXPORTA (SOCIO)');

        const props = rows((await get(`/admin/export/properties?ownerIds=${ids.ana}`)).body);
        expect(props).toHaveLength(2);
        expect(props[1][props[0].indexOf('Nome do dono')]).toBe('ANA EXPORTA');

        const regs = rows((await get(`/admin/export/registrations?courseIds=${ids.course}`)).body);
        expect(regs).toHaveLength(2);
        expect(regs[1][regs[0].indexOf('Curso')]).toBe('CURSO EXPORT');
        expect(regs[1][regs[0].indexOf('Confirmada')]).toBe('Sim');
        expect(regs[0]).toEqual(expect.arrayContaining(['Idade', 'Contato público']));
        // Horário do curso é o do relógio gravado (não converte fuso).
        expect(regs[1][regs[0].indexOf('Início do curso')]).toBe('01/01/2032 11:00');
    });

    it('POST com corpo JSON (seleção grande) e validações', async () => {
        const post = (url: string, payload: object) => app.inject({ method: 'POST',
url,
headers: bearer(token),
payload });
        const selected = await post('/admin/export/people', { ids: [ids.ana, ids.bruno] });
        expect(selected.statusCode, selected.body).toBe(200);
        expect(selected.headers['x-export-count']).toBe('2');

        const filtered = await post('/admin/export/people', { search: 'bruno',
incompleteRegistration: true });
        expect(filtered.headers['x-export-count']).toBe('1');

        expect((await post('/admin/export/people', { ids: [] })).statusCode).toBe(400);
        expect((await get('/admin/export/people?ids=,')).statusCode).toBe(400);
        expect((await get('/admin/export/people?gender=QUALQUER')).statusCode).toBe(400);
        expect((await get('/admin/export/audit-logs?from=ontem')).statusCode).toBe(400);

        // Exportar por POST não gera uma segunda linha "Criou" na auditoria.
        const created = await prisma.auditLog.count({ where: { path: '/admin/export/people',
method: 'POST' } });
        expect(created).toBe(0);
    });

    it('detalhe da pessoa traz o nome fantasia da empresa', async () => {
        const res = await get(`/admin/users/${ids.ana}`);
        const body = JSON.parse(res.body) as { companyMemberships: { company: { tradeName: string | null } }[] };
        expect(body.companyMemberships[0].company.tradeName).toBe('AGRO EXPORT');
    });

    it('permissão por conjunto, token obrigatório e conjunto desconhecido', async () => {
        const cursos = await loginAndGetToken(app, 'socursos', 'SoCursos123!');
        expect((await get('/admin/export/people', cursos)).statusCode).toBe(403);
        expect((await get('/admin/export/courses', cursos)).statusCode).toBe(200);
        expect((await get('/admin/export/people', '')).statusCode).toBe(401);
        expect((await get('/admin/export/senhas')).statusCode).toBe(400);
        expect((await get('/admin/export/companies?type=MISTA')).statusCode).toBe(400);
    });

    it('cada exportação fica na auditoria', async () => {
        const res = await get('/admin/export/audit-logs?action=export');
        expect(res.statusCode).toBe(200);
        const [header, ...data] = rows(res.body);
        expect(data.length).toBeGreaterThanOrEqual(5);
        expect(data.every(r => r[header.indexOf('Ação')] === 'Exportou uma planilha')).toBe(true);
        expect(data.map(r => r[header.indexOf('Alvo')])).toContain('Pessoas: BRUNO EXPORTA');

        const list = await app.inject({ method: 'GET',
url: '/admin/audit-logs?action=export',
headers: bearer(token) });
        expect(list.statusCode).toBe(200);
        expect((JSON.parse(list.body) as { total: number }).total).toBeGreaterThanOrEqual(5);
    });
});
