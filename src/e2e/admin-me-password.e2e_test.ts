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

// PATCH /admin/me: trocar a senha pede a senha atual (SR-007).

let app: FastifyInstance;
let prisma: PrismaClient;
let token: string;

beforeAll(async () => {
    prisma = createTestPrisma();
    await cleanDatabase(prisma);
    await seedSuperAdmin(prisma);
    app = await createTestApp(prisma);
    token = await loginAndGetToken(app);
});

afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
});

const patchMe = (payload: Record<string, unknown>) =>
    app.inject({ method: 'PATCH',
url: '/admin/me',
headers: bearer(token),
payload });

describe('PATCH /admin/me — trocar a senha', () => {
    it('sem currentPassword → 400, e a senha antiga continua', async () => {
        const res = await patchMe({ password: 'senhaNova123' });
        expect(res.statusCode).toBe(400);
        expect(JSON.parse(res.body).error).toBe('Informe a senha atual para trocar a senha.');
        await expect(loginAndGetToken(app, E2E_ADMIN_USERNAME, E2E_ADMIN_PASSWORD)).resolves.toBeTruthy();
    });

    it('currentPassword errada → 400 (não 401: o painel não desloga), nada gravado', async () => {
        const res = await patchMe({ password: 'senhaNova123',
currentPassword: 'chute',
name: 'NAO GRAVA' });
        expect(res.statusCode).toBe(400);
        expect(JSON.parse(res.body).error).toBe('Senha atual incorreta.');
        const me = await app.inject({ method: 'GET',
url: '/admin/me',
headers: bearer(token) });
        expect(JSON.parse(me.body).name).not.toBe('NAO GRAVA');
    });

    it('nome sozinho não pede a senha atual', async () => {
        const res = await patchMe({ name: 'E2E ADMIN' });
        expect(res.statusCode).toBe(200);
    });

    it('currentPassword certa → 200, e só a senha nova entra', async () => {
        const res = await patchMe({ password: 'senhaNova123',
currentPassword: E2E_ADMIN_PASSWORD });
        expect(res.statusCode).toBe(200);
        await expect(loginAndGetToken(app, E2E_ADMIN_USERNAME, 'senhaNova123')).resolves.toBeTruthy();
        await expect(loginAndGetToken(app, E2E_ADMIN_USERNAME, E2E_ADMIN_PASSWORD)).rejects.toThrow();
    });
});

describe('PATCH /admin/me — limite', () => {
    it('11º pedido em 5 minutos do mesmo IP → 429', async () => {
        const limited = await createTestApp(prisma, { rateLimit: true });
        try {
            const limitedToken = await loginAndGetToken(limited, E2E_ADMIN_USERNAME, 'senhaNova123');
            const codes: number[] = [];
            for (let i = 0; i < 11; i++) {
                const res = await limited.inject({ method: 'PATCH',
url: '/admin/me',
headers: bearer(limitedToken),
payload: { password: 'outraSenha123',
currentPassword: `chute${i}` } });
                codes.push(res.statusCode);
            }
            expect(codes.slice(0, 10).every(c => c === 400)).toBe(true);
            expect(codes[10]).toBe(429);
        } finally {
            await limited.close();
        }
    });
});
