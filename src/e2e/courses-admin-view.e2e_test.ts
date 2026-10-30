import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '../generated/prisma/client.js';
import { createTestApp } from './helpers/create-test-app.js';
import { createTestPrisma, cleanDatabase, seedSuperAdmin, loginAndGetToken, bearer } from './helpers/db.js';
import { todayInBrazil } from '../lib/quote-products.js';

// SR-057: ordem das inscrições (A6), situação de associado na lista de pessoas
// (A7) e as visões "próximos" / "Armazenados" da lista de cursos (A9).

let app: FastifyInstance;
let prisma: PrismaClient;
let token: string;
let roomId: string;
const ids: Record<string, string> = {};

const DAY = 24 * 60 * 60 * 1000;
const at = (offsetDays: number, hour: string) => {
    const day = new Date(todayInBrazil().getTime() + offsetDays * DAY).toISOString().slice(0, 10);
    return `${day}T${hour}:00.000Z`;
};

async function course(name: string, offsetDays: number, status = 'PUBLIC') {
    const res = await app.inject({
        method: 'POST',
        url: '/courses',
        headers: bearer(token),
        payload: {
            name,
            description: 'x',
            status,
            roomId,
            startTime: at(offsetDays, '08:00'),
            endTime: at(offsetDays, '17:00'),
        },
    });
    expect(res.statusCode, res.body).toBe(201);
    return (JSON.parse(res.body) as { id: string }).id;
}

type Card = {
 id: string;
title: string;
status: string 
};

async function list(query: string): Promise<Card[]> {
    const res = await app.inject({ method: 'GET',
url: `/admin/courses?limit=100${query}`,
headers: bearer(token) });
    expect(res.statusCode, res.body).toBe(200);
    return (JSON.parse(res.body) as { data: Card[] }).data;
}

const titles = (cards: Card[]) => cards.map(c => c.title);

beforeAll(async () => {
    prisma = createTestPrisma();
    await cleanDatabase(prisma);
    await seedSuperAdmin(prisma);
    app = await createTestApp(prisma);
    token = await loginAndGetToken(app);
    const room = await app.inject({
        method: 'POST',
        url: '/rooms',
        headers: bearer(token),
        payload: { name: 'AUDITORIO',
description: 'x',
maxCapacity: 50 },
    });
    roomId = (JSON.parse(room.body) as { id: string }).id;
});

afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
});

describe('GET /admin/courses?view=', () => {
    beforeAll(async () => {
        ids.antigo = await course('V Antigo', -40);
        ids.ontem = await course('V Ontem', -1);
        ids.hoje = await course('V Hoje', 0);
        ids.amanha = await course('V Amanha', 1);
        ids.futuro = await course('V Futuro', 60);
        ids.concluido = await course('V Concluido', -5);
        await prisma.course.update({ where: { id: ids.concluido },
data: { status: 'COMPLETED' } });
    });

    it('sem view, a lista é a de sempre (todos, do início mais cedo ao mais tarde)', async () => {
        expect(titles(await list(''))).toEqual(['V Antigo', 'V Concluido', 'V Ontem', 'V Hoje', 'V Amanha', 'V Futuro']);
    });

    it('upcoming: só os que começam amanhã ou depois, o mais próximo primeiro', async () => {
        expect(titles(await list('&view=upcoming'))).toEqual(['V Amanha', 'V Futuro']);
    });

    it('stored: o dia do início é hoje ou já passou, o mais recente primeiro, com o concluído marcado', async () => {
        const stored = await list('&view=stored');
        expect(titles(stored)).toEqual(['V Hoje', 'V Ontem', 'V Concluido', 'V Antigo']);
        expect(stored.find(c => c.title === 'V Concluido')?.status).toBe('COMPLETED');
    });

    it('as duas visões juntas cobrem todos os cursos, sem repetir', async () => {
        const all = [...(await list('&view=upcoming')), ...(await list('&view=stored'))];
        expect(new Set(all.map(c => c.id)).size).toBe(6);
    });

    it('combina com status, busca e ano', async () => {
        expect(titles(await list('&view=stored&status=COMPLETED'))).toEqual(['V Concluido']);
        expect(titles(await list('&view=stored&search=ontem'))).toEqual(['V Ontem']);
        const ano = new Date(at(-1, '08:00')).getUTCFullYear();
        expect((await list(`&view=stored&year=${ano}`)).length).toBeGreaterThan(0);
        expect(await list('&view=stored&year=2001')).toEqual([]);
    });

    it('view desconhecida → 400', async () => {
        const res = await app.inject({ method: 'GET',
url: '/admin/courses?view=outra',
headers: bearer(token) });
        expect(res.statusCode).toBe(400);
    });

    it('o total da página conta só a visão', async () => {
        const res = await app.inject({ method: 'GET',
url: '/admin/courses?view=stored&limit=2',
headers: bearer(token) });
        const body = JSON.parse(res.body) as {
 total: number;
data: unknown[];
totalPages: number 
};
        expect(body.total).toBe(4);
        expect(body.data).toHaveLength(2);
        expect(body.totalPages).toBe(2);
    });

    it('curso armazenado continua aceitando inscrição pela equipe, presença e conclusão', async () => {
        const person = await prisma.userData.create({ data: { name: 'ALUNO ARMAZENADO',
phone: '44990000000' } });
        const reg = await app.inject({
            method: 'POST',
            url: `/admin/courses/${ids.hoje}/registrations`,
            headers: bearer(token),
            payload: { userDataId: person.id },
        });
        expect(reg.statusCode, reg.body).toBe(201);
        const registrationId = (JSON.parse(reg.body) as { registrationId: string }).registrationId;

        const start = await app.inject({ method: 'POST',
url: `/admin/courses/${ids.hoje}/start`,
headers: bearer(token) });
        expect(start.statusCode, start.body).toBe(200);
        const att = await app.inject({
            method: 'PATCH',
            url: `/admin/registrations/${registrationId}/attendance`,
            headers: bearer(token),
            payload: { attended: true },
        });
        expect(att.statusCode, att.body).toBe(200);
        const done = await app.inject({ method: 'PATCH',
url: `/admin/courses/${ids.hoje}/complete`,
headers: bearer(token) });
        expect(done.statusCode, done.body).toBe(200);
        expect(titles(await list('&view=stored&status=COMPLETED'))).toContain('V Hoje');
    });
});

describe('inscrições do curso em ordem de chegada (A6)', () => {
    it('a mais antiga primeiro, com data e hora; a paginação não repete nem perde linha', async () => {
        const courseId = await course('V Ordem', 90);
        const names = ['PRIMEIRA', 'SEGUNDA', 'TERCEIRA', 'QUARTA', 'QUINTA'];
        for (const [i, name] of names.entries()) {
            const p = await prisma.userData.create({ data: { name,
phone: '44990000001' } });
            await prisma.courseUserRegistration.create({
                data: { courseId,
userDataId: p.id,
createdAt: new Date(Date.UTC(2031, 0, 1, 8, i)) },
            });
        }
        const page = async (n: number) => {
            const res = await app.inject({
                method: 'GET',
                url: `/admin/courses/${courseId}/registrations?limit=2&page=${n}`,
                headers: bearer(token),
            });
            expect(res.statusCode, res.body).toBe(200);
            return (JSON.parse(res.body) as {
 data: {
 createdAt: string;
userData: { name: string } 
}[] 
}).data;
        };
        const [a, b, c] = [await page(1), await page(2), await page(3)];
        expect([...a, ...b, ...c].map(r => r.userData.name)).toEqual(names);
        expect(a[0].createdAt).toBe('2031-01-01T08:00:00.000Z');
    });
});

describe('situação de associado na lista de pessoas (A7)', () => {
    it('GET /admin/users traz memberStatus e membershipValidUntil', async () => {
        await prisma.userData.create({
            data: {
                name: 'SOCIO COM VALIDADE',
                phone: '44990000002',
                memberStatus: 'ACTIVE',
                membershipValidUntil: new Date('2031-12-31T00:00:00Z'),
            },
        });
        await prisma.userData.create({ data: { name: 'NAO SOCIO',
phone: '44990000003' } });
        const res = await app.inject({ method: 'GET',
url: '/admin/users?search=socio',
headers: bearer(token) });
        expect(res.statusCode, res.body).toBe(200);
        const rows = (JSON.parse(res.body) as {
data: {
 name: string;
memberStatus: string | null;
membershipValidUntil: string | null 
}[];
}).data;
        const socio = rows.find(r => r.name === 'SOCIO COM VALIDADE');
        expect(socio).toMatchObject({ memberStatus: 'ACTIVE' });
        expect(socio?.membershipValidUntil).toMatch(/^2031-12-31/);
        const outro = rows.find(r => r.name === 'NAO SOCIO');
        expect(outro?.memberStatus ?? null).toBeNull();
        expect(outro?.membershipValidUntil ?? null).toBeNull();
    });
});
