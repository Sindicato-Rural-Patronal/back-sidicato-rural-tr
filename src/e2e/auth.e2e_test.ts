import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '../generated/prisma/client.js';
import { createTestApp } from './helpers/create-test-app.js';
import {
    createTestPrisma,
    cleanDatabase,
    seedSuperAdmin,
    E2E_ADMIN_USERNAME,
    E2E_ADMIN_PASSWORD,
} from './helpers/db.js';

let app: FastifyInstance;
let prisma: PrismaClient;

beforeAll(async () => {
    prisma = createTestPrisma();
    await cleanDatabase(prisma);
    await seedSuperAdmin(prisma);
    app = await createTestApp(prisma);
});

afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
});

describe('POST /auth/login', () => {
    it('returns 200 + JWT token with valid credentials', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/auth/login',
            payload: { username: E2E_ADMIN_USERNAME,
password: E2E_ADMIN_PASSWORD },
        });
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body) as { token: string };
        expect(typeof body.token).toBe('string');
        expect(body.token.length).toBeGreaterThan(20);
    });

    it('returns 401 with wrong password', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/auth/login',
            payload: { username: E2E_ADMIN_USERNAME,
password: 'wrongpassword' },
        });
        expect(res.statusCode).toBe(401);
        const body = JSON.parse(res.body) as { error: string };
        expect(body.error).toBeDefined();
    });

    it('returns 401 with non-existent username', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/auth/login',
            payload: { username: 'doesnotexist',
password: 'anypassword' },
        });
        expect(res.statusCode).toBe(401);
    });

    it('returns 400 when body is empty', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/auth/login',
            payload: {},
        });
        expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('returns 400 when password is missing', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/auth/login',
            payload: { username: E2E_ADMIN_USERNAME },
        });
        expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });
});

describe('GET /admin/me', () => {
    let token: string;

    beforeAll(async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/auth/login',
            payload: { username: E2E_ADMIN_USERNAME,
password: E2E_ADMIN_PASSWORD },
        });
        token = (JSON.parse(res.body) as { token: string }).token;
    });

    it('returns admin info with correct userId and userDataId', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/admin/me',
            headers: { authorization: `Bearer ${token}` },
        });
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body) as {
            userId: string;
            userDataId: string;
            username: string;
            permissions: string[];
        };
        expect(body.userId).toBeTruthy();
        expect(body.userDataId).toBeTruthy();
        expect(body.userId).not.toBe(body.userDataId);
        expect(body.username).toBe(E2E_ADMIN_USERNAME);
        expect(Array.isArray(body.permissions)).toBe(true);
        expect(body.permissions).toContain('CREATE_USER');
    });

    it('returns 401 without token', async () => {
        const res = await app.inject({ method: 'GET',
url: '/admin/me' });
        expect(res.statusCode).toBe(401);
    });

    it('returns 401 with malformed token', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/admin/me',
            headers: { authorization: 'Bearer not-a-jwt' },
        });
        expect(res.statusCode).toBe(401);
    });
});
