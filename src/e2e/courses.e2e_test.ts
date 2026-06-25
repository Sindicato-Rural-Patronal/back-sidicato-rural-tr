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

let app: FastifyInstance;
let prisma: PrismaClient;
let token: string;
let roomId: string;

const COURSE_PAYLOAD = {
    name: 'Curso de Irrigação',
    description: 'Técnicas avançadas de irrigação',
    startTime: '2026-09-01T08:00:00.000Z',
    endTime: '2026-09-01T17:00:00.000Z',
    status: 'PUBLIC',
    price: 0,
    workloadHours: 8,
};

beforeAll(async () => {
    prisma = createTestPrisma();
    await cleanDatabase(prisma);
    await seedSuperAdmin(prisma);
    app = await createTestApp(prisma);
    token = await loginAndGetToken(app);

    // Create a room — required for all course tests
    const roomRes = await app.inject({
        method: 'POST',
        url: '/rooms',
        headers: bearer(token),
        payload: { name: 'Sala Principal', description: 'Sala de testes E2E', maxCapacity: 50 },
    });
    expect(roomRes.statusCode, `Room creation failed: ${roomRes.body}`).toBe(201);
    roomId = (JSON.parse(roomRes.body) as { id: string }).id;
});

afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// POST /rooms
// ---------------------------------------------------------------------------
describe('POST /rooms', () => {
    it('creates a room and returns 201', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/rooms',
            headers: bearer(token),
            payload: { name: 'Sala Extra', description: 'Extra room', maxCapacity: 20 },
        });
        expect(res.statusCode).toBe(201);
        const body = JSON.parse(res.body) as { id: string };
        expect(body.id).toBeTruthy();
    });

    it('returns 401 without token', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/rooms',
            payload: { name: 'No Auth Room', description: 'Test', maxCapacity: 10 },
        });
        expect(res.statusCode).toBe(401);
    });
});

// ---------------------------------------------------------------------------
// GET /rooms
// ---------------------------------------------------------------------------
describe('GET /rooms', () => {
    it('returns array of rooms (public route)', async () => {
        const res = await app.inject({ method: 'GET', url: '/rooms' });
        expect(res.statusCode).toBe(200);
        expect(Array.isArray(JSON.parse(res.body))).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// POST /courses
// ---------------------------------------------------------------------------
describe('POST /courses', () => {
    it('creates a PUBLIC course and returns 201', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/courses',
            headers: bearer(token),
            payload: { ...COURSE_PAYLOAD, roomId },
        });
        expect(res.statusCode).toBe(201);
        const body = JSON.parse(res.body) as { id: string };
        expect(body.id).toBeTruthy();
    });

    it('creates an UNPUBLISHED course', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/courses',
            headers: bearer(token),
            payload: { ...COURSE_PAYLOAD, name: 'Curso Rascunho', status: 'UNPUBLISHED', roomId },
        });
        expect(res.statusCode).toBe(201);
    });

    it('returns 401 without token', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/courses',
            payload: { ...COURSE_PAYLOAD, roomId },
        });
        expect(res.statusCode).toBe(401);
    });

    it('returns 404 when roomId does not exist', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/courses',
            headers: bearer(token),
            payload: { ...COURSE_PAYLOAD, roomId: '00000000-0000-0000-0000-000000000000' },
        });
        expect(res.statusCode).toBe(404);
    });
});

// ---------------------------------------------------------------------------
// GET /courses (public listing)
// ---------------------------------------------------------------------------
describe('GET /courses', () => {
    it('returns only PUBLIC courses (not UNPUBLISHED or PRIVATE)', async () => {
        // Ensure at least one PUBLIC course exists
        await app.inject({
            method: 'POST',
            url: '/courses',
            headers: bearer(token),
            payload: { ...COURSE_PAYLOAD, name: 'Public Visible', status: 'PUBLIC', roomId },
        });
        await app.inject({
            method: 'POST',
            url: '/courses',
            headers: bearer(token),
            payload: { ...COURSE_PAYLOAD, name: 'Hidden Draft', status: 'UNPUBLISHED', roomId },
        });

        const res = await app.inject({ method: 'GET', url: '/courses' });
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body) as { data: { name: string; status: string }[] };
        const unpublished = body.data.filter(c => c.status === 'UNPUBLISHED');
        expect(unpublished).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// GET /admin/courses (admin listing — all statuses)
// ---------------------------------------------------------------------------
describe('GET /admin/courses', () => {
    it('returns all courses regardless of status', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/admin/courses',
            headers: bearer(token),
        });
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body) as { data: unknown[] };
        expect(Array.isArray(body.data)).toBe(true);
    });

    it('returns 401 without token', async () => {
        const res = await app.inject({ method: 'GET', url: '/admin/courses' });
        expect(res.statusCode).toBe(401);
    });
});

// ---------------------------------------------------------------------------
// GET /courses/:courseId (public detail)
// ---------------------------------------------------------------------------
describe('GET /courses/:courseId', () => {
    let publicCourseId: string;
    let unpublishedCourseId: string;

    beforeAll(async () => {
        const pubRes = await app.inject({
            method: 'POST',
            url: '/courses',
            headers: bearer(token),
            payload: { ...COURSE_PAYLOAD, name: 'Detail Public', status: 'PUBLIC', roomId },
        });
        publicCourseId = (JSON.parse(pubRes.body) as { id: string }).id;

        const unpubRes = await app.inject({
            method: 'POST',
            url: '/courses',
            headers: bearer(token),
            payload: { ...COURSE_PAYLOAD, name: 'Detail Unpublished', status: 'UNPUBLISHED', roomId },
        });
        unpublishedCourseId = (JSON.parse(unpubRes.body) as { id: string }).id;
    });

    it('returns PUBLIC course detail', async () => {
        const res = await app.inject({
            method: 'GET',
            url: `/courses/${publicCourseId}`,
        });
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body) as { id: string; name: string };
        expect(body.id).toBe(publicCourseId);
        expect(body.name).toBe('Detail Public');
    });

    it('returns 404 for UNPUBLISHED course via public route', async () => {
        const res = await app.inject({
            method: 'GET',
            url: `/courses/${unpublishedCourseId}`,
        });
        expect(res.statusCode).toBe(404);
    });

    it('returns 404 for non-existent course', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/courses/00000000-0000-0000-0000-000000000000',
        });
        expect(res.statusCode).toBe(404);
    });
});

// ---------------------------------------------------------------------------
// PATCH /courses/:courseId
// ---------------------------------------------------------------------------
describe('PATCH /courses/:courseId', () => {
    let courseId: string;

    beforeAll(async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/courses',
            headers: bearer(token),
            payload: { ...COURSE_PAYLOAD, name: 'To Update', status: 'UNPUBLISHED', roomId },
        });
        courseId = (JSON.parse(res.body) as { id: string }).id;
    });

    it('updates course name and status', async () => {
        const res = await app.inject({
            method: 'PATCH',
            url: `/courses/${courseId}`,
            headers: bearer(token),
            payload: { name: 'Updated Course Name', status: 'PUBLIC' },
        });
        expect(res.statusCode).toBe(200);
    });

    it('returns 404 for non-existent course', async () => {
        const res = await app.inject({
            method: 'PATCH',
            url: '/courses/00000000-0000-0000-0000-000000000000',
            headers: bearer(token),
            payload: { name: 'Ghost' },
        });
        expect(res.statusCode).toBe(404);
    });
});

// ---------------------------------------------------------------------------
// DELETE /courses/:courseId
// ---------------------------------------------------------------------------
describe('DELETE /courses/:courseId', () => {
    it('deletes course and returns 204', async () => {
        const createRes = await app.inject({
            method: 'POST',
            url: '/courses',
            headers: bearer(token),
            payload: { ...COURSE_PAYLOAD, name: 'Disposable Course', roomId },
        });
        const { id } = JSON.parse(createRes.body) as { id: string };

        const deleteRes = await app.inject({
            method: 'DELETE',
            url: `/courses/${id}`,
            headers: bearer(token),
        });
        expect(deleteRes.statusCode).toBe(204);

        // Should no longer appear in admin listing
        const adminRes = await app.inject({
            method: 'GET',
            url: '/admin/courses?limit=100',
            headers: bearer(token),
        });
        const body = JSON.parse(adminRes.body) as { data: { id: string }[] };
        expect(body.data.some(c => c.id === id)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// POST /courses/:courseId/register (course registration)
// ---------------------------------------------------------------------------
describe('POST /courses/:courseId/register', () => {
    let publicCourseId: string;
    let unpublishedCourseId: string;

    beforeAll(async () => {
        const pubRes = await app.inject({
            method: 'POST',
            url: '/courses',
            headers: bearer(token),
            payload: { ...COURSE_PAYLOAD, name: 'Reg Public Course', status: 'PUBLIC', roomId },
        });
        publicCourseId = (JSON.parse(pubRes.body) as { id: string }).id;

        const unpubRes = await app.inject({
            method: 'POST',
            url: '/courses',
            headers: bearer(token),
            payload: { ...COURSE_PAYLOAD, name: 'Reg Unpublished Course', status: 'UNPUBLISHED', roomId },
        });
        unpublishedCourseId = (JSON.parse(unpubRes.body) as { id: string }).id;
    });

    it('registers user for PUBLIC course', async () => {
        const res = await app.inject({
            method: 'POST',
            url: `/courses/${publicCourseId}/register`,
            payload: {
                name: 'Inscrito Silva',
                email: 'inscrito@test.com',
                phone: '44911110060',
                cpf: '11122233360',
            },
        });
        expect(res.statusCode).toBe(201);
    });

    it('returns 409 when registering same user twice', async () => {
        await app.inject({
            method: 'POST',
            url: `/courses/${publicCourseId}/register`,
            payload: {
                name: 'Double Reg',
                email: 'doublereg@test.com',
                phone: '44911110061',
                cpf: '11122233361',
            },
        });
        const res = await app.inject({
            method: 'POST',
            url: `/courses/${publicCourseId}/register`,
            payload: {
                name: 'Double Reg',
                email: 'doublereg@test.com',
                phone: '44911110061',
                cpf: '11122233361',
            },
        });
        expect(res.statusCode).toBe(409);
    });

    it('returns 409 for UNPUBLISHED course registrations', async () => {
        const res = await app.inject({
            method: 'POST',
            url: `/courses/${unpublishedCourseId}/register`,
            payload: {
                name: 'Blocked User',
                email: 'blocked@test.com',
                phone: '44911110062',
                cpf: '11122233362',
            },
        });
        // UNPUBLISHED blocks registrations — should be 409 (RegistrationsUnavailableError)
        expect(res.statusCode).toBe(409);
    });

    it('returns 404 for non-existent course', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/courses/00000000-0000-0000-0000-000000000000/register',
            payload: {
                name: 'Ghost Reg',
                email: 'ghost@test.com',
                phone: '44911110063',
                cpf: '11122233363',
            },
        });
        expect(res.statusCode).toBe(404);
    });
});

// ---------------------------------------------------------------------------
// GET /admin/courses/:courseId/registrations
// ---------------------------------------------------------------------------
describe('GET /admin/courses/:courseId/registrations', () => {
    let courseId: string;

    beforeAll(async () => {
        const courseRes = await app.inject({
            method: 'POST',
            url: '/courses',
            headers: bearer(token),
            payload: { ...COURSE_PAYLOAD, name: 'List Reg Course', status: 'PUBLIC', roomId },
        });
        courseId = (JSON.parse(courseRes.body) as { id: string }).id;

        await app.inject({
            method: 'POST',
            url: `/courses/${courseId}/register`,
            payload: { name: 'Reg 1', email: 'reg1@test.com', phone: '44911110070', cpf: '11122233370' },
        });
        await app.inject({
            method: 'POST',
            url: `/courses/${courseId}/register`,
            payload: { name: 'Reg 2', email: 'reg2@test.com', phone: '44911110071', cpf: '11122233371' },
        });
    });

    it('lists all registrations for admin', async () => {
        const res = await app.inject({
            method: 'GET',
            url: `/admin/courses/${courseId}/registrations`,
            headers: bearer(token),
        });
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body) as unknown[];
        expect(Array.isArray(body)).toBe(true);
        expect(body.length).toBeGreaterThanOrEqual(2);
    });

    it('returns 401 without token', async () => {
        const res = await app.inject({
            method: 'GET',
            url: `/admin/courses/${courseId}/registrations`,
        });
        expect(res.statusCode).toBe(401);
    });
});
