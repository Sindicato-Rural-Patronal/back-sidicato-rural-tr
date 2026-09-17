import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '../generated/prisma/client.js';
import { createTestApp } from './helpers/create-test-app.js';
import {
    createTestPrisma,
    cleanDatabase,
    seedSuperAdmin,
    loginAndGetToken,
    bearer,
    E2E_ADMIN_USERNAME,
    E2E_ADMIN_PASSWORD,
} from './helpers/db.js';

// Auditoria contra o Postgres de verdade: de onde veio (IP, navegador), o que
// mudou numa edição e as tentativas de login (sem nunca gravar a senha).
// NODE_ENV=test desliga a geolocalização: `location` fica null aqui.

const IP = '203.0.113.50';
const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

let app: FastifyInstance;
let prisma: PrismaClient;
let token: string;
let adminId: string;
let personId: string;

type AuditItem = {
    method: string;
    path: string;
    actorId: string | null;
    targetLabel: string | null;
    summary: string;
    ip: string | null;
    location: string | null;
    device: string | null;
    userAgent: string | null;
    changes: {
        field: string;
        before: unknown;
        after: unknown;
    }[] | null;
};

/** A linha é gravada depois da resposta (onResponse): espera ela aparecer. */
async function waitForRow(where: Record<string, unknown>) {
    for (let i = 0; i < 40; i++) {
        const row = await prisma.auditLog.findFirst({ where,
orderBy: { createdAt: 'desc' } });
        if (row) return row;
        await new Promise(r => setTimeout(r, 50));
    }
    throw new Error(`linha de auditoria não gravada: ${JSON.stringify(where)}`);
}

async function listAudit(query: string): Promise<{
    data: AuditItem[];
    total: number;
}> {
    const res = await app.inject({ method: 'GET',
url: `/admin/audit-logs?${query}`,
headers: bearer(token) });
    expect(res.statusCode, res.body).toBe(200);
    return JSON.parse(res.body);
}

beforeAll(async () => {
    prisma = createTestPrisma();
    await cleanDatabase(prisma);
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "AuditLog"');
    const seeded = await seedSuperAdmin(prisma);
    adminId = seeded.userAdmin.id;
    app = await createTestApp(prisma);
    token = await loginAndGetToken(app);
    const person = await prisma.userData.create({
        data: { name: 'JOÃO AUDITADO',
email: 'joao.auditado@test.com',
phone: '44933330001' },
    });
    personId = person.id;
});

afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
});

describe('auditoria: contexto da requisição e o que mudou', () => {
    it('edição de pessoa guarda antes/depois, IP e navegador', async () => {
        const res = await app.inject({
            method: 'PATCH',
            url: `/users/${personId}`,
            headers: { ...bearer(token),
'user-agent': CHROME },
            remoteAddress: IP,
            payload: { phone: '44933339999' },
        });
        expect(res.statusCode, res.body).toBe(200);

        const row = await waitForRow({ method: 'PATCH',
path: `/users/${personId}` });
        expect(row.actorId).toBe(adminId);
        expect(row.ip).toBe(IP);
        expect(row.userAgent).toBe(CHROME);
        expect(row.location).toBeNull();
        const changes = row.changes as {
            field: string;
            before: unknown;
            after: unknown;
        }[];
        expect(changes).toContainEqual({ field: 'phone',
before: '44933330001',
after: '44933339999' });
        // Só o que mudou; nada de colunas internas.
        expect(changes.some(c => c.field === 'updatedAt' || c.field === 'nameSearch')).toBe(false);
    });

    it('lista traz ip, local, aparelho, userAgent e changes; filtro por IP', async () => {
        const { data } = await listAudit(`ip=${IP}`);
        expect(data.length).toBeGreaterThanOrEqual(1);
        expect(data.every(r => r.ip === IP)).toBe(true);
        const edit = data.find(r => r.method === 'PATCH')!;
        expect(edit.device).toBe('Chrome no Windows');
        expect(edit.userAgent).toBe(CHROME);
        expect(edit).toHaveProperty('location', null);
        expect(edit.changes).toContainEqual({ field: 'phone',
before: '44933330001',
after: '44933339999' });

        const other = await listAudit('ip=198.51.100.200');
        expect(other.total).toBe(0);
    });
});

describe('auditoria: tentativas de login', () => {
    it('senha errada vira LOGIN_FAILED com o usuário e sem a senha', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/auth/login',
            remoteAddress: IP,
            payload: { username: E2E_ADMIN_USERNAME,
password: 'SenhaVazada#123' },
        });
        expect(res.statusCode).toBe(401);

        const row = await waitForRow({ method: 'LOGIN_FAILED',
targetLabel: E2E_ADMIN_USERNAME });
        expect(row.actorId).toBeNull();
        expect(row.ip).toBe(IP);
        expect(JSON.stringify(row)).not.toContain('SenhaVazada#123');

        // Usuário que não existe (pode ser a senha no campo errado) não é gravado.
        const unknown = await app.inject({
            method: 'POST',
            url: '/auth/login',
            remoteAddress: IP,
            payload: { username: 'SenhaNoCampoErrado#9',
password: 'x' },
        });
        expect(unknown.statusCode).toBe(401);
        await waitForRow({ method: 'LOGIN_FAILED',
targetLabel: '(usuário inexistente)' });

        const { data } = await listAudit('action=login_failed');
        expect(data.some(r => r.summary === `Tentativa de login falhou (usuário "${E2E_ADMIN_USERNAME}")`)).toBe(true);
        expect(data.some(r => r.summary === 'Tentativa de login falhou (usuário inexistente)')).toBe(true);
        expect(JSON.stringify(data)).not.toContain('SenhaVazada#123');
        expect(JSON.stringify(data)).not.toContain('SenhaNoCampoErrado#9');
    });

    it('login certo vira LOGIN com o id do admin', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/auth/login',
            remoteAddress: IP,
            headers: { 'user-agent': CHROME },
            payload: { username: E2E_ADMIN_USERNAME,
password: E2E_ADMIN_PASSWORD },
        });
        expect(res.statusCode).toBe(200);

        const row = await waitForRow({ method: 'LOGIN',
ip: IP });
        expect(row.actorId).toBe(adminId);
        expect(JSON.stringify(row)).not.toContain(E2E_ADMIN_PASSWORD);

        const { data } = await listAudit('action=login');
        expect(data.length).toBeGreaterThanOrEqual(1);
        expect(data.every(r => r.method === 'LOGIN')).toBe(true);
        expect(data.some(r => r.summary === 'Entrou no painel' && r.actorId === adminId)).toBe(true);
    });
});
