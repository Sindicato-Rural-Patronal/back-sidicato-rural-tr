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

// ---------------------------------------------------------------------------
// POST /users
// ---------------------------------------------------------------------------
describe('POST /users', () => {
    it('creates a user and returns 201 with id', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/users',
            payload: {
                name: 'João Silva',
                email: 'joao.silva@test.com',
                phone: '44911110001',
                cpf: '11122233301',
            },
        });
        expect(res.statusCode).toBe(201);
        const body = JSON.parse(res.body) as {
 id: string;
email: string 
};
        expect(body.id).toBeTruthy();
        expect(body.email).toBe('joao.silva@test.com');
    });

    it('returns 409 when email already registered', async () => {
        await app.inject({
            method: 'POST',
            url: '/users',
            payload: { name: 'First',
email: 'dup@test.com',
phone: '44911110002',
cpf: '11122233302' },
        });
        const res = await app.inject({
            method: 'POST',
            url: '/users',
            payload: { name: 'Second',
email: 'dup@test.com',
phone: '44911110003',
cpf: '11122233303' },
        });
        expect(res.statusCode).toBe(409);
    });

    it('returns 409 when phone already registered', async () => {
        await app.inject({
            method: 'POST',
            url: '/users',
            payload: { name: 'Phone First',
email: 'phone1@test.com',
phone: '44911110004',
cpf: '11122233304' },
        });
        const res = await app.inject({
            method: 'POST',
            url: '/users',
            payload: { name: 'Phone Second',
email: 'phone2@test.com',
phone: '44911110004',
cpf: '11122233305' },
        });
        expect(res.statusCode).toBe(409);
    });

    it('returns 400 when required fields are missing', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/users',
            payload: { name: 'Missing Fields' },
        });
        expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('returns 400 on invalid email format', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/users',
            payload: { name: 'Bad Email',
email: 'not-an-email',
phone: '44911110006',
cpf: '11122233306' },
        });
        expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });
});

// ---------------------------------------------------------------------------
// GET /admin/users
// ---------------------------------------------------------------------------
describe('GET /admin/users', () => {
    it('returns paginated list with metadata', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/admin/users?page=1&limit=5',
            headers: bearer(token),
        });
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body) as {
            data: unknown[];
            total: number;
            page: number;
            limit: number;
            totalPages: number;
        };
        expect(Array.isArray(body.data)).toBe(true);
        expect(typeof body.total).toBe('number');
        expect(body.page).toBe(1);
        expect(body.limit).toBe(5);
        expect(typeof body.totalPages).toBe('number');
    });

    it('returns 401 without token', async () => {
        const res = await app.inject({ method: 'GET',
url: '/admin/users' });
        expect(res.statusCode).toBe(401);
    });
});

// ---------------------------------------------------------------------------
// GET /admin/users/:id
// ---------------------------------------------------------------------------
describe('GET /admin/users/:id', () => {
    let userId: string;

    beforeAll(async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/users',
            payload: { name: 'Detail User',
email: 'detail@test.com',
phone: '44911110010',
cpf: '11122233310' },
        });
        userId = (JSON.parse(res.body) as { id: string }).id;
    });

    it('returns full user with address/relations/properties arrays', async () => {
        const res = await app.inject({
            method: 'GET',
            url: `/admin/users/${userId}`,
            headers: bearer(token),
        });
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body) as {
            id: string;
            email: string;
            relations: unknown[];
            properties: unknown[];
        };
        expect(body.id).toBe(userId);
        expect(body.email).toBe('detail@test.com');
        expect(Array.isArray(body.relations)).toBe(true);
        expect(Array.isArray(body.properties)).toBe(true);
    });

    it('returns 404 for non-existent id', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/admin/users/00000000-0000-0000-0000-000000000000',
            headers: bearer(token),
        });
        expect(res.statusCode).toBe(404);
    });
});

// ---------------------------------------------------------------------------
// PATCH /users/:id
// ---------------------------------------------------------------------------
describe('PATCH /users/:id', () => {
    let userId: string;

    beforeAll(async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/users',
            payload: { name: 'Update Target',
email: 'update@test.com',
phone: '44911110020',
cpf: '11122233320' },
        });
        userId = (JSON.parse(res.body) as { id: string }).id;
    });

    it('updates name and returns 200', async () => {
        const res = await app.inject({
            method: 'PATCH',
            url: `/users/${userId}`,
            headers: bearer(token),
            payload: { name: 'Updated Name' },
        });
        expect(res.statusCode).toBe(200);
    });

    it('updates enum fields (maritalStatus, gender)', async () => {
        const res = await app.inject({
            method: 'PATCH',
            url: `/users/${userId}`,
            headers: bearer(token),
            payload: { maritalStatus: 'MARRIED',
gender: 'MALE',
memberStatus: 'ACTIVE' },
        });
        expect(res.statusCode).toBe(200);

        // Verify via GET
        const getRes = await app.inject({
            method: 'GET',
            url: `/admin/users/${userId}`,
            headers: bearer(token),
        });
        const body = JSON.parse(getRes.body) as {
 maritalStatus: string;
gender: string 
};
        expect(body.maritalStatus).toBe('MARRIED');
        expect(body.gender).toBe('MALE');
    });

    it('returns 400 on invalid enum value', async () => {
        const res = await app.inject({
            method: 'PATCH',
            url: `/users/${userId}`,
            headers: bearer(token),
            payload: { maritalStatus: 'SOLTEIRO' },
        });
        expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('returns 404 for non-existent user', async () => {
        const res = await app.inject({
            method: 'PATCH',
            url: '/users/00000000-0000-0000-0000-000000000000',
            headers: bearer(token),
            payload: { name: 'Ghost' },
        });
        expect(res.statusCode).toBe(404);
    });

    it('returns 401 without token', async () => {
        const res = await app.inject({
            method: 'PATCH',
            url: `/users/${userId}`,
            payload: { name: 'No Auth' },
        });
        expect(res.statusCode).toBe(401);
    });
});

// ---------------------------------------------------------------------------
// DELETE /users/:id (soft delete)
// ---------------------------------------------------------------------------
describe('DELETE /users/:id', () => {
    it('soft-deletes user and returns 204', async () => {
        const createRes = await app.inject({
            method: 'POST',
            url: '/users',
            payload: { name: 'To Delete',
email: 'todelete@test.com',
phone: '44911110030',
cpf: '11122233330' },
        });
        const { id } = JSON.parse(createRes.body) as { id: string };

        const deleteRes = await app.inject({
            method: 'DELETE',
            url: `/users/${id}`,
            headers: bearer(token),
        });
        expect(deleteRes.statusCode).toBe(204);
    });

    it('deleted user is not returned by GET /admin/users/:id', async () => {
        const createRes = await app.inject({
            method: 'POST',
            url: '/users',
            payload: { name: 'Ghost User',
email: 'ghost@test.com',
phone: '44911110031',
cpf: '11122233331' },
        });
        const { id } = JSON.parse(createRes.body) as { id: string };

        await app.inject({ method: 'DELETE',
url: `/users/${id}`,
headers: bearer(token) });

        const getRes = await app.inject({
            method: 'GET',
            url: `/admin/users/${id}`,
            headers: bearer(token),
        });
        expect(getRes.statusCode).toBe(404);
    });

    it('deleted user does not appear in GET /admin/users list', async () => {
        const createRes = await app.inject({
            method: 'POST',
            url: '/users',
            payload: { name: 'Vanish User',
email: 'vanish@test.com',
phone: '44911110032',
cpf: '11122233332' },
        });
        const { id } = JSON.parse(createRes.body) as { id: string };

        await app.inject({ method: 'DELETE',
url: `/users/${id}`,
headers: bearer(token) });

        const listRes = await app.inject({
            method: 'GET',
            url: '/admin/users?limit=100',
            headers: bearer(token),
        });
        const { data } = JSON.parse(listRes.body) as { data: { id: string }[] };
        const found = data.some(u => u.id === id);
        expect(found).toBe(false);
    });

    it('returns 404 when deleting non-existent user', async () => {
        const res = await app.inject({
            method: 'DELETE',
            url: '/users/00000000-0000-0000-0000-000000000000',
            headers: bearer(token),
        });
        expect(res.statusCode).toBe(404);
    });
});

// ---------------------------------------------------------------------------
// PUT /admin/users/:id/address
// ---------------------------------------------------------------------------
describe('PUT /admin/users/:id/address', () => {
    let userId: string;

    beforeAll(async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/users',
            payload: { name: 'Addr User',
email: 'addruser@test.com',
phone: '44911110040',
cpf: '11122233340' },
        });
        userId = (JSON.parse(res.body) as { id: string }).id;
    });

    it('creates address when user has none and returns addressId', async () => {
        const res = await app.inject({
            method: 'PUT',
            url: `/admin/users/${userId}/address`,
            headers: bearer(token),
            payload: {
                type: 'URBAN',
                city: 'Terra Roxa',
                state: 'PR',
                zipCode: '85990-000',
                street: 'Av da Saudade',
                number: '991',
                neighborhood: 'Centro',
            },
        });
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body) as { addressId: string };
        expect(body.addressId).toBeTruthy();
    });

    it('upserts address on second call (returns same or new addressId)', async () => {
        const res = await app.inject({
            method: 'PUT',
            url: `/admin/users/${userId}/address`,
            headers: bearer(token),
            payload: { city: 'Nova Cidade',
state: 'SP' },
        });
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body) as { addressId: string };
        expect(body.addressId).toBeTruthy();
    });
});

// ---------------------------------------------------------------------------
// POST /admin/users/:id/relations
// ---------------------------------------------------------------------------
describe('POST /admin/users/:id/relations', () => {
    let userAId: string;
    let userBId: string;

    beforeAll(async () => {
        const resA = await app.inject({
            method: 'POST',
            url: '/users',
            payload: { name: 'Rel User A',
email: 'relA@test.com',
phone: '44911110050',
cpf: '11122233350' },
        });
        const resB = await app.inject({
            method: 'POST',
            url: '/users',
            payload: { name: 'Rel User B',
email: 'relB@test.com',
phone: '44911110051',
cpf: '11122233351' },
        });
        userAId = (JSON.parse(resA.body) as { id: string }).id;
        userBId = (JSON.parse(resB.body) as { id: string }).id;
    });

    it('creates relation and returns 201 with id', async () => {
        const res = await app.inject({
            method: 'POST',
            url: `/admin/users/${userAId}/relations`,
            headers: bearer(token),
            payload: { targetId: userBId,
label: 'cônjuge' },
        });
        expect(res.statusCode).toBe(201);
        const body = JSON.parse(res.body) as { id: string };
        expect(body.id).toBeTruthy();
    });

    it('relation appears in user detail', async () => {
        const res = await app.inject({
            method: 'GET',
            url: `/admin/users/${userAId}`,
            headers: bearer(token),
        });
        const body = JSON.parse(res.body) as {
 relations: {
 label: string;
target: { id: string } 
}[] 
};
        const rel = body.relations.find(r => r.target.id === userBId);
        expect(rel).toBeDefined();
        expect(rel!.label).toBe('cônjuge');
    });
});
