import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '../generated/prisma/client.js';
import { createTestApp } from './helpers/create-test-app.js';
import { createTestPrisma, cleanDatabase, seedSuperAdmin, loginAndGetToken, bearer } from './helpers/db.js';

// SR-019: o PATCH de curso consegue limpar os campos opcionais. Texto e prazo
// viram null; as colunas numéricas não aceitam null e voltam a 0.

let app: FastifyInstance;
let prisma: PrismaClient;
let token: string;
let courseId: string;

const FILLED = {
    price: 150.5,
    workloadHours: 16,
    minStudents: 5,
    preEnrolled: 3,
    waitlist: 2,
    registrationDeadline: '2031-03-01T23:59:00.000Z',
    observations: 'Trazer botas',
    eventNumber: 'EVT-1',
};

const patch = (payload: object) =>
    app.inject({ method: 'PATCH',
url: `/courses/${courseId}`,
headers: bearer(token),
payload });

const row = () => prisma.course.findUniqueOrThrow({ where: { id: courseId } });

async function refill() {
    const res = await patch(FILLED);
    expect(res.statusCode, res.body).toBe(200);
}

beforeAll(async () => {
    prisma = createTestPrisma();
    await cleanDatabase(prisma);
    await seedSuperAdmin(prisma);
    app = await createTestApp(prisma);
    token = await loginAndGetToken(app);
    const room = await app.inject({ method: 'POST',
url: '/rooms',
headers: bearer(token),
payload: { name: 'AUDITORIO',
description: 'x',
maxCapacity: 50 } });
    const roomId = (JSON.parse(room.body) as { id: string }).id;
    const res = await app.inject({ method: 'POST',
url: '/courses',
headers: bearer(token),
payload: { name: 'Curso limpar',
description: 'x',
status: 'UNPUBLISHED',
roomId,
startTime: '2031-04-01T08:00:00.000Z',
endTime: '2031-04-01T17:00:00.000Z' } });
    expect(res.statusCode, res.body).toBe(201);
    courseId = (JSON.parse(res.body) as { id: string }).id;
});

afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
});

describe('PATCH /courses/:id limpando campos', () => {
    it('grava os valores antes de limpar', async () => {
        await refill();
        expect(await row()).toMatchObject({ price: 150.5,
workloadHours: 16,
minStudents: 5,
observations: 'Trazer botas',
eventNumber: 'EVT-1' });
    });

    it.each([
        ['price', 0],
        ['workloadHours', 0],
        ['minStudents', 0],
        ['preEnrolled', 0],
        ['waitlist', 0],
    ])('%s: null volta a 0', async (field, expected) => {
        await refill();
        const res = await patch({ [field]: null });
        expect(res.statusCode, res.body).toBe(200);
        const r = await row();
        expect(r[field as keyof typeof r]).toBe(expected);
        // O que não foi mandado fica como estava.
        expect(r.observations).toBe('Trazer botas');
    });

    it.each([['price'], ['workloadHours'], ['minStudents']])('%s: 0 também grava 0', async field => {
        await refill();
        const res = await patch({ [field]: 0 });
        expect(res.statusCode, res.body).toBe(200);
        const r = await row();
        expect(r[field as keyof typeof r]).toBe(0);
    });

    it.each([['observations'], ['eventNumber']])('%s: null e texto vazio gravam null', async field => {
        for (const value of [null, '', '   ']) {
            await refill();
            const res = await patch({ [field]: value });
            expect(res.statusCode, res.body).toBe(200);
            const r = await row();
            expect(r[field as keyof typeof r], `valor enviado: ${JSON.stringify(value)}`).toBeNull();
        }
    });

    it('registrationDeadline: null tira o prazo', async () => {
        await refill();
        expect((await row()).registrationDeadline).not.toBeNull();
        const res = await patch({ registrationDeadline: null });
        expect(res.statusCode, res.body).toBe(200);
        expect((await row()).registrationDeadline).toBeNull();
    });

    it('limpa tudo de uma vez', async () => {
        await refill();
        const res = await patch({ price: null,
workloadHours: null,
minStudents: null,
preEnrolled: null,
waitlist: null,
registrationDeadline: null,
observations: null,
eventNumber: null });
        expect(res.statusCode, res.body).toBe(200);
        expect(await row()).toMatchObject({ price: 0,
workloadHours: 0,
minStudents: 0,
preEnrolled: 0,
waitlist: 0,
registrationDeadline: null,
observations: null,
eventNumber: null });
    });

    it('não mandar o campo não limpa nada', async () => {
        await refill();
        const res = await patch({ description: 'Nova descrição' });
        expect(res.statusCode, res.body).toBe(200);
        expect(await row()).toMatchObject({ ...FILLED,
registrationDeadline: new Date(FILLED.registrationDeadline) });
    });

    it('valor negativo continua recusado', async () => {
        expect((await patch({ price: -1 })).statusCode).toBe(400);
        expect((await patch({ workloadHours: -1 })).statusCode).toBe(400);
    });

    it('a ficha do admin devolve os campos limpos', async () => {
        await patch({ observations: null,
eventNumber: null,
registrationDeadline: null,
workloadHours: null });
        const res = await app.inject({ method: 'GET',
url: `/admin/courses/${courseId}`,
headers: bearer(token) });
        expect(res.statusCode, res.body).toBe(200);
        const body = JSON.parse(res.body) as Record<string, unknown>;
        expect(body.workloadHours).toBe(0);
        expect(body.observations ?? null).toBeNull();
        expect(body.eventNumber ?? null).toBeNull();
        expect(body.registrationDeadline ?? null).toBeNull();
    });
});
