/**
 * Permissions & Auth enforcement E2E tests.
 *
 * Covers:
 * - Missing token → 401
 * - Invalid/expired token → 401
 * - Valid token but wrong permission → 403
 * - Valid token with correct permission → 200/201
 */
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
} from './helpers/db.js';
import { hash } from 'bcrypt';

let app: FastifyInstance;
let prisma: PrismaClient;
let superToken: string;
let limitedToken: string;

const INVALID_TOKEN = 'Bearer eyJhbGciOiJIUzI1NiJ9.invalid.signature';

beforeAll(async () => {
    prisma = createTestPrisma();
    await cleanDatabase(prisma);
    const { rule } = await seedSuperAdmin(prisma);
    app = await createTestApp(prisma);
    superToken = await loginAndGetToken(app);

    // Create a rule with minimal permissions (READ_USER only)
    const limitedRule = await prisma.rule.create({
        data: {
            name: 'LIMITED_RULE',
            description: 'Only READ_USER permission',
            permissions: ['READ_USER'],
        },
    });

    // Create a limited admin user
    const limitedUserData = await prisma.userData.create({
        data: { name: 'Limited Admin',
email: 'limited@test.local',
phone: '44900000001' },
    });
    await prisma.userAdmin.create({
        data: {
            username: 'limitedadmin',
            passwordHash: await hash('limitedPass123!', 4),
            userDataId: limitedUserData.id,
            rulesId: limitedRule.id,
        },
    });

    limitedToken = await loginAndGetToken(app, 'limitedadmin', 'limitedPass123!');

    // Suppress unused variable warning
    void rule;
});

afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// No token (401 on all protected routes)
// ---------------------------------------------------------------------------
describe('No token → 401', () => {
    const protectedRoutes = [
        { method: 'GET' as const,
url: '/admin/users' },
        { method: 'GET' as const,
url: '/admin/users/some-id' },
        { method: 'PATCH' as const,
url: '/users/some-id' },
        { method: 'DELETE' as const,
url: '/users/some-id' },
        { method: 'GET' as const,
url: '/admin/courses' },
        { method: 'POST' as const,
url: '/courses' },
        { method: 'GET' as const,
url: '/admin/me' },
        { method: 'GET' as const,
url: '/admin/rules' },
        { method: 'GET' as const,
url: '/admin/news' },
    ];

    for (const { method, url } of protectedRoutes) {
        it(`${method} ${url} returns 401`, async () => {
            const res = await app.inject({ method,
url });
            expect(res.statusCode).toBe(401);
        });
    }
});

// ---------------------------------------------------------------------------
// Invalid token (401)
// ---------------------------------------------------------------------------
describe('Invalid token → 401', () => {
    it('GET /admin/users with malformed token', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/admin/users',
            headers: { authorization: INVALID_TOKEN },
        });
        expect(res.statusCode).toBe(401);
    });

    it('GET /admin/me with garbage token', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/admin/me',
            headers: { authorization: 'Bearer not-a-real-token' },
        });
        expect(res.statusCode).toBe(401);
    });

    it('PATCH /users/id with token signed with wrong secret', async () => {
        // Token signed with a different secret — decodeToken returns null
        const wrongToken =
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
            'eyJ1c2VySWQiOiJmYWtlIiwiaWF0IjoxNjAwMDAwMDAwfQ.' +
            'wrongsignature';
        const res = await app.inject({
            method: 'PATCH',
            url: '/users/some-id',
            headers: { authorization: `Bearer ${wrongToken}` },
            payload: { name: 'Should not reach' },
        });
        expect(res.statusCode).toBe(401);
    });
});

// ---------------------------------------------------------------------------
// Valid token but missing permission → 403
// ---------------------------------------------------------------------------
describe('Valid token, insufficient permission → 403', () => {
    it('POST /courses (requires CREATE_COURSE) with READ_USER token → 403', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/courses',
            headers: bearer(limitedToken),
            payload: {
                name: 'Forbidden Course',
                description: 'Should fail',
                roomId: '00000000-0000-0000-0000-000000000000',
                startTime: '2026-09-01T08:00:00.000Z',
                endTime: '2026-09-01T17:00:00.000Z',
            },
        });
        expect(res.statusCode).toBe(403);
    });

    it('DELETE /users/:id (requires DELETE_USER) with READ_USER token → 403', async () => {
        // Create a user to try to delete
        const createRes = await app.inject({
            method: 'POST',
            url: '/users',
            payload: { name: 'Perm Target',
email: 'permtarget@test.com',
phone: '44911110080',
cpf: '11122233380' },
        });
        const { id } = JSON.parse(createRes.body) as { id: string };

        const res = await app.inject({
            method: 'DELETE',
            url: `/users/${id}`,
            headers: bearer(limitedToken),
        });
        expect(res.statusCode).toBe(403);
    });

    it('GET /admin/news (requires READ_NEWS) with READ_USER token → 403', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/admin/news',
            headers: bearer(limitedToken),
        });
        expect(res.statusCode).toBe(403);
    });

    it('POST /rules (requires CREATE_RULE) with READ_USER token → 403', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/rules',
            headers: bearer(limitedToken),
            payload: { name: 'Bad Rule',
description: 'test',
permissions: [] },
        });
        expect(res.statusCode).toBe(403);
    });
});

// ---------------------------------------------------------------------------
// Super admin can access everything
// ---------------------------------------------------------------------------
describe('Super admin token → 200/201 on all routes', () => {
    it('GET /admin/users → 200', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/admin/users',
            headers: bearer(superToken),
        });
        expect(res.statusCode).toBe(200);
    });

    it('GET /admin/me → 200', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/admin/me',
            headers: bearer(superToken),
        });
        expect(res.statusCode).toBe(200);
    });

    it('GET /admin/rules → 200', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/admin/rules',
            headers: bearer(superToken),
        });
        expect(res.statusCode).toBe(200);
    });

    it('GET /admin/news → 200', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/admin/news',
            headers: bearer(superToken),
        });
        expect(res.statusCode).toBe(200);
    });

    it('GET /admin/dashboard/stats → 200', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/admin/dashboard/stats',
            headers: bearer(superToken),
        });
        expect(res.statusCode).toBe(200);
    });
});

// ---------------------------------------------------------------------------
// Limited admin can access allowed routes
// ---------------------------------------------------------------------------
describe('Limited admin (READ_USER only) → 200 on allowed routes', () => {
    it('GET /admin/users → 200', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/admin/users',
            headers: bearer(limitedToken),
        });
        expect(res.statusCode).toBe(200);
    });

    it('GET /admin/me → 200', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/admin/me',
            headers: bearer(limitedToken),
        });
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body) as { permissions: string[] };
        expect(body.permissions).toEqual(['READ_USER']);
    });
});

// ---------------------------------------------------------------------------
// Public routes must NOT require auth
// ---------------------------------------------------------------------------
describe('Public routes accessible without token', () => {
    const publicRoutes = [
        { method: 'GET' as const,
url: '/courses' },
        { method: 'GET' as const,
url: '/news' },
        { method: 'GET' as const,
url: '/rooms' },
        { method: 'GET' as const,
url: '/partners' },
        { method: 'GET' as const,
url: '/banners' },
    ];

    for (const { method, url } of publicRoutes) {
        it(`${method} ${url} is accessible without token`, async () => {
            const res = await app.inject({ method,
url });
            expect(res.statusCode).toBe(200);
        });
    }
});
