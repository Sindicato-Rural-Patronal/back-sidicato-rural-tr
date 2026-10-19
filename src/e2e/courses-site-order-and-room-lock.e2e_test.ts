import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '../generated/prisma/client.js';
import { createTestApp } from './helpers/create-test-app.js';
import { createTestPrisma, cleanDatabase, seedSuperAdmin, loginAndGetToken, bearer } from './helpers/db.js';
import { todayInBrazil } from '../lib/quote-products.js';

// SR-016: ordem do GET /courses, término depois do início, trava de sala ao
// gravar curso e o register-full sob concorrência.

let app: FastifyInstance;
let prisma: PrismaClient;
let token: string;
let roomId: string;

/** Dia relativo a hoje em Brasília, como "AAAA-MM-DD" (datas do curso são hora de parede). */
function day(offset: number): string {
    const d = todayInBrazil();
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
}

async function publicCourse(name: string, startDay: string, endDay = startDay) {
    return prisma.course.create({
        data: {
            name,
            description: 'E2E',
            status: 'PUBLIC',
            roomId,
            startTime: new Date(`${startDay}T08:00:00.000Z`),
            endTime: new Date(`${endDay}T12:00:00.000Z`),
        },
    });
}

beforeAll(async () => {
    prisma = createTestPrisma();
    await cleanDatabase(prisma);
    await seedSuperAdmin(prisma);
    app = await createTestApp(prisma);
    token = await loginAndGetToken(app);
    roomId = (await prisma.room.create({ data: { name: 'SALA 2',
description: 'E2E',
maxCapacity: 30 } })).id;
});

afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
});

describe('GET /courses', () => {
    beforeAll(async () => {
        // Criados direto no banco (datas no passado não passam pelo painel).
        await publicCourse('PASSADO ANTIGO', day(-400));
        await publicCourse('PASSADO RECENTE', day(-3));
        await publicCourse('ONTEM', day(-1));
        await publicCourse('EM ANDAMENTO', day(-2), day(2));
        await publicCourse('HOJE', day(0));
        await publicCourse('PROXIMO', day(20));
        await prisma.course.create({ data: { name: 'PRIVADO FUTURO',
description: 'E2E',
status: 'PRIVATE',
roomId,
            startTime: new Date(`${day(5)}T08:00:00.000Z`),
endTime: new Date(`${day(5)}T12:00:00.000Z`) } });
    });

    const titles = async (query: string) => {
        const res = await app.inject({ method: 'GET',
url: `/courses${query}` });
        expect(res.statusCode).toBe(200);
        return JSON.parse(res.body) as {
 data: { title: string }[];
total: number;
totalPages: number 
};
    };

    it('os que não terminaram primeiro (por início), depois os terminados (mais recente primeiro)', async () => {
        const body = await titles('');
        expect(body.data.map(c => c.title)).toEqual([
            'EM ANDAMENTO', 'HOJE', 'PROXIMO', 'ONTEM', 'PASSADO RECENTE', 'PASSADO ANTIGO',
        ]);
        expect(body.total).toBe(6);
    });

    it('ended=exclude deixa só os que não terminaram', async () => {
        const body = await titles('?ended=exclude');
        expect(body.data.map(c => c.title)).toEqual(['EM ANDAMENTO', 'HOJE', 'PROXIMO']);
        expect(body.total).toBe(3);
    });

    it('a paginação continua nos terminados', async () => {
        const second = await titles('?limit=4&page=2');
        expect(second.data.map(c => c.title)).toEqual(['PASSADO RECENTE', 'PASSADO ANTIGO']);
        expect(second.totalPages).toBe(2);
    });

    it('ended inválido → 400', async () => {
        const res = await app.inject({ method: 'GET',
url: '/courses?ended=talvez' });
        expect(res.statusCode).toBe(400);
    });
});

describe('término depois do início', () => {
    it('criar com término antes do início → 400', async () => {
        const res = await app.inject({ method: 'POST',
url: '/courses',
headers: bearer(token),
            payload: { name: 'X',
description: 'X',
roomId,
startTime: `${day(40)}T12:00:00.000Z`,
endTime: `${day(40)}T08:00:00.000Z` } });
        expect(res.statusCode).toBe(400);
        expect(JSON.parse(res.body).error).toBe('O término do curso precisa ser depois do início.');
    });

    it('editar só o término para antes do início → 400', async () => {
        const created = await publicCourse('EDITAVEL', day(41));
        const res = await app.inject({ method: 'PATCH',
url: `/courses/${created.id}`,
headers: bearer(token),
            payload: { endTime: `${day(41)}T07:00:00.000Z` } });
        expect(res.statusCode).toBe(400);
    });
});

describe('mensagens de validação em português', () => {
    const post = (payload: Record<string, unknown>) => app.inject({ method: 'POST',
url: '/courses',
headers: bearer(token),
payload });

    it('descrição vazia e término antes do início', async () => {
        const res = await post({ name: 'X',
description: '',
roomId,
startTime: `${day(50)}T12:00:00.000Z`,
endTime: `${day(50)}T08:00:00.000Z` });
        expect(res.statusCode).toBe(400);
        expect(JSON.parse(res.body).error).toBe('Informe a descrição do curso. O término do curso precisa ser depois do início.');
    });

    it('campo obrigatório que não veio (JSON schema) sai em português', async () => {
        const res = await post({ name: 'X' });
        expect(res.statusCode).toBe(400);
        expect(JSON.parse(res.body).error).toMatch(/^Informe o campo "/);
    });
});

describe('trava de sala ao gravar curso', () => {
    it('curso e reserva no mesmo horário, ao mesmo tempo: só um entra', async () => {
        const slot = { startTime: `${day(60)}T08:00:00.000Z`,
endTime: `${day(60)}T12:00:00.000Z` };
        const [course, booking] = await Promise.all([
            app.inject({ method: 'POST',
url: '/courses',
headers: bearer(token),
payload: { name: 'CONCORRENTE',
description: 'X',
roomId,
...slot } }),
            app.inject({ method: 'POST',
url: '/admin/room-bookings',
headers: bearer(token),
payload: { type: 'MEETING',
title: 'Reunião concorrente',
roomId,
...slot } }),
        ]);
        const created = [course.statusCode, booking.statusCode].filter(s => s === 201);
        expect(created).toHaveLength(1);
        // O que perdeu recebe a mensagem de sala ocupada (curso: 400; reserva: 409).
        const loser = course.statusCode === 201 ? booking : course;
        expect(JSON.parse(loser.body).error).toMatch(/^Sala ocupada: /);
    });

    it('dois cursos no mesmo horário, ao mesmo tempo: só um entra', async () => {
        const slot = { startTime: `${day(61)}T08:00:00.000Z`,
endTime: `${day(61)}T12:00:00.000Z` };
        const results = await Promise.all([1, 2, 3].map(i => app.inject({ method: 'POST',
url: '/courses',
headers: bearer(token),
            payload: { name: `CONCORRENTE ${i}`,
description: 'X',
roomId,
...slot } })));
        expect(results.filter(r => r.statusCode === 201)).toHaveLength(1);
        expect(await prisma.course.count({ where: { roomId,
startTime: new Date(slot.startTime),
isDeleted: false } })).toBe(1);
    });

    it('mudar o curso para o horário de outro → 409 com a mensagem de sala ocupada', async () => {
        const a = await publicCourse('A', day(70));
        const b = await publicCourse('B', day(71));
        const res = await app.inject({ method: 'PATCH',
url: `/courses/${b.id}`,
headers: bearer(token),
            payload: { startTime: a.startTime.toISOString(),
endTime: a.endTime.toISOString() } });
        expect(res.statusCode).toBe(409);
        expect(JSON.parse(res.body).error).toMatch(/^Sala ocupada: Curso "A"/);
    });
});

describe('register-full sob concorrência', () => {
    it('inscrições ao mesmo tempo no mesmo curso entram todas, sem erro cru do Prisma', async () => {
        const course = await publicCourse('CONCORRIDO', day(80));
        const cpfs = ['52998224725', '11144477735', '39053344705', '15350946056', '86288366757'];
        const results = await Promise.all(cpfs.map((cpf, i) => app.inject({ method: 'POST',
url: `/courses/${course.id}/register-full`,
            payload: { name: `PESSOA ${i}`,
phone: `4492222000${i}`,
cpf } })));
        for (const r of results) {
            expect(r.statusCode, r.body).toBe(201);
            expect(r.body).not.toMatch(/Transaction|Prisma|write conflict/i);
        }
        expect(await prisma.courseUserRegistration.count({ where: { courseId: course.id,
isDeleted: false } })).toBe(cpfs.length);
    });
});
