import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '../generated/prisma/client.js';
import { hash } from 'bcrypt';
import { createTestApp } from './helpers/create-test-app.js';
import { createTestPrisma, cleanDatabase, seedSuperAdmin, loginAndGetToken, bearer } from './helpers/db.js';
import { AUDIT_RETENTION_KEY } from '../usecase/audit-retention.js';
import { resetAuditCleanupClock } from '../adapter/database/audit-cleanup.js';

// Tempo de guarda da trilha: quem pode ver (READ_AUDIT), quem pode mudar
// (UPDATE_AUDIT) e a limpeza dos registros que passaram do prazo.

const DAY_MS = 24 * 60 * 60 * 1000;

let app: FastifyInstance;
let prisma: PrismaClient;
let token: string;
let readOnlyToken: string;

/** Linha antiga direto no banco (createdAt controlado). */
async function seedLog(daysAgo: number, path: string) {
    await prisma.auditLog.create({
        data: {
            method: 'POST',
            path,
            entity: 'Curso',
            statusCode: 200,
            createdAt: new Date(Date.now() - daysAgo * DAY_MS),
        },
    });
}

beforeAll(async () => {
    prisma = createTestPrisma();
    await cleanDatabase(prisma);
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "AuditLog"');
    await prisma.siteSetting.deleteMany({ where: { key: AUDIT_RETENTION_KEY } });
    await seedSuperAdmin(prisma);
    app = await createTestApp(prisma);
    token = await loginAndGetToken(app);

    // Admin que só lê a trilha (sem UPDATE_AUDIT).
    const rule = await prisma.rule.create({
        data: { name: 'SO_LE_AUDITORIA',
description: 'E2E',
permissions: ['READ_AUDIT'] },
    });
    const person = await prisma.userData.create({
        data: { name: 'LEITOR AUDITORIA',
email: 'leitor.auditoria@test.local',
phone: '44900000123' },
    });
    await prisma.userAdmin.create({
        data: {
            username: 'e2eauditread',
            passwordHash: await hash('e2ePassword123!', 4),
            userDataId: person.id,
            rulesId: rule.id,
        },
    });
    readOnlyToken = await loginAndGetToken(app, 'e2eauditread', 'e2ePassword123!');
});

afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
});

describe('configuração da trilha de auditoria', () => {
    it('GET devolve 0 (guardar para sempre) quando nada foi configurado', async () => {
        const res = await app.inject({ method: 'GET',
url: '/admin/audit-settings',
headers: bearer(token) });
        expect(res.statusCode, res.body).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.retentionDays).toBe(0);
        expect(body.options).toEqual([0, 90, 180, 365, 730]);
        expect(body).toHaveProperty('oldestAt');
        expect(body).toHaveProperty('total');
    });

    it('sem token: 401', async () => {
        const res = await app.inject({ method: 'GET',
url: '/admin/audit-settings' });
        expect(res.statusCode).toBe(401);
    });

    it('quem só lê a trilha vê a configuração mas não muda (403)', async () => {
        const get = await app.inject({
            method: 'GET',
            url: '/admin/audit-settings',
            headers: bearer(readOnlyToken),
        });
        expect(get.statusCode, get.body).toBe(200);

        const patch = await app.inject({
            method: 'PATCH',
            url: '/admin/audit-settings',
            headers: bearer(readOnlyToken),
            payload: { retentionDays: 90 },
        });
        expect(patch.statusCode, patch.body).toBe(403);
    });

    it('recusa valores fora da faixa (1 a 29 dias)', async () => {
        const res = await app.inject({
            method: 'PATCH',
            url: '/admin/audit-settings',
            headers: bearer(token),
            payload: { retentionDays: 7 },
        });
        expect(res.statusCode, res.body).toBe(400);
    });

    it('guarda 0 não apaga nada, por mais antigo que o registro seja', async () => {
        await seedLog(2000, '/courses/antigo-demais');
        const res = await app.inject({
            method: 'PATCH',
            url: '/admin/audit-settings',
            headers: bearer(token),
            payload: { retentionDays: 0 },
        });
        expect(res.statusCode, res.body).toBe(200);
        expect(JSON.parse(res.body).deleted).toBe(0);
        expect(await prisma.auditLog.count({ where: { path: '/courses/antigo-demais' } })).toBe(1);
    });

    it('baixar a guarda apaga o que passou do prazo e mantém o resto', async () => {
        await seedLog(200, '/courses/velho');
        await seedLog(10, '/courses/recente');

        const res = await app.inject({
            method: 'PATCH',
            url: '/admin/audit-settings',
            headers: bearer(token),
            payload: { retentionDays: 90 },
        });
        expect(res.statusCode, res.body).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.retentionDays).toBe(90);
        expect(body.deleted).toBeGreaterThanOrEqual(2); // o de 200 dias e o de 2000

        expect(await prisma.auditLog.count({ where: { path: '/courses/velho' } })).toBe(0);
        expect(await prisma.auditLog.count({ where: { path: '/courses/antigo-demais' } })).toBe(0);
        expect(await prisma.auditLog.count({ where: { path: '/courses/recente' } })).toBe(1);

        // O valor fica gravado e o mais antigo informado respeita a guarda.
        const get = await app.inject({ method: 'GET',
url: '/admin/audit-settings',
headers: bearer(token) });
        const after = JSON.parse(get.body);
        expect(after.retentionDays).toBe(90);
        expect(new Date(after.oldestAt).getTime()).toBeGreaterThan(Date.now() - 91 * DAY_MS);
    });

    it('a própria mudança entra na trilha como "Auditoria"', async () => {
        const list = await app.inject({
            method: 'GET',
            url: '/admin/audit-logs?entity=Auditoria',
            headers: bearer(token),
        });
        expect(list.statusCode, list.body).toBe(200);
        const { data } = JSON.parse(list.body);
        expect(data.length).toBeGreaterThanOrEqual(1);
        expect(data[0].path).toBe('/admin/audit-settings');
    });

    it('a limpeza de rotina roda a reboque de uma gravação na trilha', async () => {
        await seedLog(400, '/courses/expirado-pela-rotina');
        // A janela de uma hora por processo já foi usada pelos testes acima.
        resetAuditCleanupClock();

        // Qualquer mutação auditada serve de gatilho.
        const res = await app.inject({
            method: 'POST',
            url: '/rooms',
            headers: bearer(token),
            payload: { name: 'SALA 1',
description: 'Gatilho da limpeza',
maxCapacity: 10 },
        });
        expect([200, 201, 409]).toContain(res.statusCode);

        for (let i = 0; i < 40; i++) {
            if ((await prisma.auditLog.count({ where: { path: '/courses/expirado-pela-rotina' } })) === 0) break;
            await new Promise(r => setTimeout(r, 50));
        }
        expect(await prisma.auditLog.count({ where: { path: '/courses/expirado-pela-rotina' } })).toBe(0);
    });
});
