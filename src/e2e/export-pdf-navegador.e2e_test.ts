import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '../generated/prisma/client.js';
import { createTestApp } from './helpers/create-test-app.js';
import { createTestPrisma, cleanDatabase, seedSuperAdmin, loginAndGetToken, bearer } from './helpers/db.js';

// `pdfDoNavegador` (SR-125): o painel monta o PDF a partir do CSV. A resposta é
// o mesmo CSV, byte a byte, com os mesmos cabeçalhos; só a Auditoria diz PDF.

let app: FastifyInstance;
let prisma: PrismaClient;
let token: string;

const get = (url: string) => app.inject({ method: 'GET',
url,
headers: bearer(token) });
const post = (url: string, payload: object) =>
    app.inject({ method: 'POST',
url,
headers: bearer(token),
payload });

const exportLines = () => prisma.auditLog.findMany({ where: { method: 'EXPORT' },
orderBy: { createdAt: 'asc' } });
const clearAudit = () => prisma.$executeRawUnsafe('TRUNCATE TABLE "AuditLog"');

type AuditRow = {
 targetLabel: string;
summary: string;
details: unknown 
};
async function lastAuditRow(): Promise<AuditRow> {
    const res = await get('/admin/audit-logs?action=export');
    expect(res.statusCode).toBe(200);
    return (res.json() as { data: AuditRow[] }).data[0];
}

beforeAll(async () => {
    prisma = createTestPrisma();
    await cleanDatabase(prisma);
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "AuditLog"');
    await seedSuperAdmin(prisma);
    app = await createTestApp(prisma);
    token = await loginAndGetToken(app);
    await prisma.userData.create({ data: { name: 'ANA PDF',
cpf: '52998224725',
phone: '44911114001' } });
    await prisma.userData.create({ data: { name: 'BIA PDF',
phone: '44911114002' } });
});

afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
});

describe('lista com montador (people)', () => {
    it('POST: o mesmo CSV e os mesmos cabeçalhos; a auditoria diz PDF', async () => {
        await clearAudit();
        const base = { fields: ['name', 'cpf'],
modelo: 'nome-cpf' };
        const normal = await post('/admin/export/people', base);
        const pdf = await post('/admin/export/people', { ...base,
pdfDoNavegador: true });
        expect(pdf.statusCode, pdf.body).toBe(200);
        expect(pdf.rawPayload.equals(normal.rawPayload)).toBe(true);
        for (const h of ['content-type', 'content-disposition', 'x-export-count', 'access-control-expose-headers']) {
            expect(pdf.headers[h], h).toBe(normal.headers[h]);
        }
        expect(pdf.headers['content-type']).toBe('text/csv; charset=utf-8');

        const [a, b] = await exportLines();
        expect(a.targetLabel).toMatch(/^Pessoas: \d+ registros \(todos\) · CSV · com CPF$/);
        expect(a.details).toMatchObject({ formato: 'csv' });
        expect(b.targetLabel).toBe(a.targetLabel!.replace('· CSV ·', '· PDF ·'));
        // O resto do details é o de sempre para esse pedido.
        expect(b.details).toEqual({ ...(a.details as object),
formato: 'pdf' });
    });

    it('GET (query "true"), sem fields: o mesmo CSV; a frase é a do PDF', async () => {
        await clearAudit();
        const normal = await get('/admin/export/people');
        const pdf = await get('/admin/export/people?pdfDoNavegador=true');
        expect(pdf.statusCode, pdf.body).toBe(200);
        expect(pdf.rawPayload.equals(normal.rawPayload)).toBe(true);
        expect(pdf.headers['content-disposition']).toBe(normal.headers['content-disposition']);

        const row = await lastAuditRow();
        expect(row.targetLabel).toMatch(/^Pessoas: \d+ registros \(todos\) · PDF/);
        expect(row.summary).toBe(`Exportou o relatório em PDF "${row.targetLabel}"`);
        expect(row.details).toMatchObject({ formato: 'pdf',
modelo: 'Padrão (como hoje)',
escopo: 'todos' });
    });

    it('false (corpo e query) = como hoje: planilha CSV', async () => {
        await clearAudit();
        await post('/admin/export/people', { pdfDoNavegador: false });
        await get('/admin/export/people?pdfDoNavegador=false');
        const lines = await exportLines();
        expect(lines).toHaveLength(2);
        for (const l of lines) expect(l.details).toMatchObject({ formato: 'csv' });
        const row = await lastAuditRow();
        expect(row.summary).toMatch(/^Exportou a planilha "/);
    });
});

describe('relatório de cadastros', () => {
    it('o mesmo CSV; a linha diz PDF e ganha details', async () => {
        await clearAudit();
        const normal = await get('/admin/export/cadastros');
        const pdf = await post('/admin/export/cadastros', { pdfDoNavegador: true });
        expect(pdf.statusCode, pdf.body).toBe(200);
        expect(pdf.rawPayload.equals(normal.rawPayload)).toBe(true);
        for (const h of ['content-type', 'content-disposition', 'x-export-count']) {
            expect(pdf.headers[h], h).toBe(normal.headers[h]);
        }

        const [a, b] = await exportLines();
        const count = Number(normal.headers['x-export-count']);
        expect(a.details).toBeNull();
        expect(a.targetLabel).toMatch(/^Relatório de cadastros: \d+ registros \(todos\)$/);
        expect(b.targetLabel).toBe(`${a.targetLabel} · PDF`);
        expect(b.details).toEqual({ formato: 'pdf',
modelo: null,
campos: [],
escopo: 'todos',
filtros: [],
linhas: count });
        const row = await lastAuditRow();
        expect(row.summary).toBe(`Exportou o relatório em PDF "${b.targetLabel}"`);
    });
});

describe('combinações inválidas: 400 e nenhuma linha de auditoria', () => {
    for (const dataset of ['people', 'cadastros']) {
        for (const format of ['xlsx', 'pdf']) {
            it(`${dataset} com format=${format}`, async () => {
                await clearAudit();
                const res = await post(`/admin/export/${dataset}`, { format,
pdfDoNavegador: true });
                expect(res.statusCode, res.body).toBe(400);
                expect(res.json()).toEqual({ error: 'pdfDoNavegador só vale para o CSV.' });
                const viaGet = await get(`/admin/export/${dataset}?format=${format}&pdfDoNavegador=true`);
                expect(viaGet.statusCode).toBe(400);
                expect(viaGet.json()).toEqual({ error: 'pdfDoNavegador só vale para o CSV.' });
                expect(await exportLines()).toHaveLength(0);
            });
        }
    }

    it('valor que não é boolean → 400, sem linha', async () => {
        await clearAudit();
        for (const dataset of ['people', 'cadastros']) {
            const res = await post(`/admin/export/${dataset}`, { pdfDoNavegador: 'talvez' });
            expect(res.statusCode, res.body).toBe(400);
            expect(res.json().error).toBe('Valor inválido em "pdfDoNavegador": esperado verdadeiro ou falso.');
            const viaGet = await get(`/admin/export/${dataset}?pdfDoNavegador=talvez`);
            expect(viaGet.statusCode).toBe(400);
            expect(viaGet.json().error).toBe('Valor inválido em "pdfDoNavegador": esperado verdadeiro ou falso.');
        }
        expect(await exportLines()).toHaveLength(0);
    });

    it('false com xlsx continua valendo (como hoje)', async () => {
        await clearAudit();
        const res = await post('/admin/export/people', { format: 'xlsx',
pdfDoNavegador: false });
        expect(res.statusCode, res.body).toBe(200);
        const [line] = await exportLines();
        expect(line.details).toMatchObject({ formato: 'xlsx' });
    });
});
