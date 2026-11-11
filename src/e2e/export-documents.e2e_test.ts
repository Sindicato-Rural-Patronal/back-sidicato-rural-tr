import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hash } from 'bcrypt';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '../generated/prisma/client.js';
import { createTestApp } from './helpers/create-test-app.js';
import { createTestPrisma, cleanDatabase, seedSuperAdmin, loginAndGetToken, bearer } from './helpers/db.js';

// Documentos montados no navegador na auditoria (SR-104): POST
// /admin/export/documents/:kind grava a linha EXPORT com a permissão do
// documento; 400 para tipo ou corpo inválido, 403 sem a permissão, 429 acima
// do limite por minuto.

let app: FastifyInstance;
let prisma: PrismaClient;
let token: string;
let courseOnly: string;
let financeOnly: string;
let userOnly: string;
const COURSE_ID = '0b4f9f1e-2a54-4c55-9d0f-6a1d1c1e7a01';

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

const send = (kind: string, payload: object, auth: string | null = token) =>
    app.inject({
        method: 'POST',
        url: `/admin/export/documents/${kind}`,
        headers: { ...(auth ? bearer(auth) : {}),
'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0' },
        payload,
    });

const exportLines = () => prisma.auditLog.count({ where: { method: 'EXPORT' } });
const lastExport = () => prisma.auditLog.findFirst({ where: { method: 'EXPORT' },
orderBy: { createdAt: 'desc' } });

beforeAll(async () => {
    prisma = createTestPrisma();
    await cleanDatabase(prisma);
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "AuditLog"');
    await seedSuperAdmin(prisma);
    app = await createTestApp(prisma);
    token = await loginAndGetToken(app);
    courseOnly = await adminWith('doc.cursos', ['READ_COURSE']);
    financeOnly = await adminWith('doc.financeiro', ['READ_FINANCE']);
    userOnly = await adminWith('doc.usuarios', ['READ_USER']);
});

afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
});

describe('POST /admin/export/documents/:kind', () => {
    it('lista de presença: 204, uma linha EXPORT com alvo, detalhes, IP e aparelho', async () => {
        const before = await exportLines();
        const res = await send('lista-presenca', { alvo: 'HORTA',
ids: [COURSE_ID],
linhas: 12 }, courseOnly);
        expect(res.statusCode, res.body).toBe(204);
        expect(res.body).toBe('');
        // Uma linha só: o hook geral não grava outra (o caminho é de exportação).
        expect(await exportLines()).toBe(before + 1);
        expect(await prisma.auditLog.count({ where: { path: '/admin/export/documents/lista-presenca' } })).toBe(1);

        const log = await lastExport();
        const actor = await prisma.userAdmin.findFirstOrThrow({ where: { username: 'doc.cursos' } });
        expect(log).toMatchObject({
            actorId: actor.id,
            method: 'EXPORT',
            path: '/admin/export/documents/lista-presenca',
            entity: 'Exportação',
            targetLabel: 'Lista de presença: HORTA · 12 registros · com CPF',
            // O status que a rota respondeu (SR-112).
            statusCode: 204,
        });
        expect(log!.userAgent).toContain('Chrome');
        expect(log!.ip).toBeTruthy();
        expect(log!.details).toEqual({
            formato: 'pdf',
            modelo: 'Lista de presença',
            campos: [],
            escopo: 'seleção',
            filtros: [],
            linhas: 12,
            documento: 'lista-presenca',
            alvo: 'HORTA',
            ids: [COURSE_ID],
        });
    });

    it('com 0 registros a linha não cita dado pessoal (SR-112)', async () => {
        const res = await send('agenda', { alvo: '05/10/2026 a 11/10/2026',
linhas: 0,
escopo: 'com filtros' }, courseOnly);
        expect(res.statusCode, res.body).toBe(204);
        const log = await lastExport();
        expect(log).toMatchObject({ path: '/admin/export/documents/agenda',
targetLabel: 'Agenda: 05/10/2026 a 11/10/2026 · 0 registros',
statusCode: 204 });
    });

    it('na tela da Auditoria: filtro "Exportações", busca pelo nome e a frase "Gerou o documento"', async () => {
        const res = await get('/admin/audit-logs?action=export&q=presença');
        expect(res.statusCode, res.body).toBe(200);
        const [row] = (res.json() as {
 data: {
 summary: string;
details: unknown;
statusCode: number
}[]
}).data;
        expect(row.summary).toBe('Gerou o documento "Lista de presença: HORTA · 12 registros · com CPF"');
        // O "Detalhe técnico" da tela mostra este status.
        expect(row.statusCode).toBe(204);
        expect(row.details).toMatchObject({ formato: 'pdf',
modelo: 'Lista de presença' });

        // A planilha da auditoria: a ação diz qual documento.
        const csv = await get('/admin/export/audit-logs?action=export&q=presença&fields=action,target,exportDetails');
        expect(csv.statusCode, csv.body).toBe(200);
        const lines = csv.body.replace(/^﻿/, '').trim().split('\r\n');
        expect(lines[1]).toBe('"Gerou o documento ""Lista de presença""";"Lista de presença: HORTA · 12 registros · com CPF";"Formato: PDF; Modelo: Lista de presença; Escopo: seleção; Linhas: 12"');
    });

    it('cada documento pede a sua permissão', async () => {
        const cases: [string, string, number][] = [
            ['lista-presenca', courseOnly, 204],
            ['agenda', courseOnly, 204],
            ['ficha-inscricao', courseOnly, 403], // pede também READ_USER
            ['nota-empenho', courseOnly, 403],
            ['unimed-ficha', courseOnly, 403],
            ['financeiro', financeOnly, 204],
            ['relatorio-despesas', financeOnly, 204],
            ['nota-empenho', financeOnly, 204],
            ['recibo', financeOnly, 204],
            ['lista-presenca', financeOnly, 403],
            ['unimed-ficha', userOnly, 204],
            ['unimed-termo-adesao', userOnly, 204],
            ['unimed-contrato', userOnly, 204],
            ['relatorio-cadastros', userOnly, 403], // pede também READ_USER_ADMIN
            ['recibo', userOnly, 403],
            ['ficha-inscricao', token, 204],
            ['relatorio-cadastros', token, 204],
        ];
        for (const [kind, auth, status] of cases) {
            const res = await send(kind, { linhas: 1 }, auth);
            expect(res.statusCode, `${kind}: ${res.body}`).toBe(status);
            if (status === 403) expect(res.json()).toEqual({ error: 'Forbidden' });
        }
    });

    it('403 não deixa linha', async () => {
        const before = await exportLines();
        expect((await send('nota-empenho', { linhas: 1 }, courseOnly)).statusCode).toBe(403);
        expect(await exportLines()).toBe(before);
    });

    it('documento desconhecido → 400 (também para quem não tem permissão nenhuma do documento); sem token → 401', async () => {
        for (const auth of [token, courseOnly]) {
            const res = await send('senhas', { linhas: 1 }, auth);
            expect(res.statusCode).toBe(400);
            expect(res.json()).toEqual({ error: 'Valor não aceito em "kind".' });
        }
        expect((await send('lista-presenca', { linhas: 1 }, null)).statusCode).toBe(401);
    });

    it('corpo inválido → 400 e nenhuma linha', async () => {
        const before = await exportLines();
        const cases: [object, string][] = [
            [{}, 'Informe o campo "linhas".'],
            [{ linhas: -1 }, 'Valor menor que o mínimo em "linhas": 0.'],
            [{ linhas: 1,
ids: [] }, 'Lista curta demais em "ids": mínimo de 1 itens.'],
            [{ linhas: 1,
alvo: 'x'.repeat(121) }, 'Texto longo demais em "alvo": máximo de 120 caracteres.'],
            [{ linhas: 1,
escopo: 'tudo' }, 'Valor não aceito em "escopo".'],
        ];
        for (const [body, message] of cases) {
            const res = await send('recibo', body);
            expect(res.statusCode, JSON.stringify(body)).toBe(400);
            expect(res.json()).toEqual({ error: message });
        }
        expect(await exportLines()).toBe(before);
    });
});

describe('limite por minuto', () => {
    it('30 documentos por minuto por IP; o 31º → 429; as exportações contam à parte', async () => {
        const limited = await createTestApp(prisma, { rateLimit: true });
        try {
            const post = () => limited.inject({ method: 'POST',
url: '/admin/export/documents/recibo',
headers: bearer(token),
payload: { linhas: 1 } });
            for (let i = 0; i < 30; i++) {
                const res = await post();
                expect(res.statusCode, `pedido ${i + 1}`).toBe(204);
            }
            const blocked = await post();
            expect(blocked.statusCode).toBe(429);
            expect(blocked.json()).toEqual({ error: 'Muitos documentos seguidos. Aguarde um minuto e tente de novo.' });
            const exported = await limited.inject({ method: 'GET',
url: '/admin/export/courses',
headers: bearer(token) });
            expect(exported.statusCode).toBe(200);
        } finally {
            await limited.close();
        }
    });
});

function get(url: string, auth = token) {
    return app.inject({ method: 'GET',
url,
headers: bearer(auth) });
}
