/**
 * Reservas de sala (eventos e reuniões) — E2E.
 *
 * Cobre: criar uma reserva, conflito com curso e com reserva (409), série
 * semanal, excluir desta em diante, curso recusado sobre uma reserva, agenda
 * com os dois tipos, exportação CSV e 403 sem CREATE_COURSE.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { hash } from 'bcrypt';
import type { PrismaClient } from '../generated/prisma/client.js';
import { createTestApp } from './helpers/create-test-app.js';
import { createTestPrisma, cleanDatabase, seedSuperAdmin, loginAndGetToken, bearer } from './helpers/db.js';

let app: FastifyInstance;
let prisma: PrismaClient;
let token: string;
let readOnlyToken: string;
let roomId: string;
let otherRoomId: string;
let courseId: string;

type Booking = {
    id: string;
    type: string;
    title: string;
    description: string | null;
    roomId: string;
    roomName: string;
    startTime: string;
    endTime: string;
    responsible: {
 id: string;
name: string 
} | null;
    responsibleName: string | null;
    seriesId: string | null;
};

const json = <T>(body: string) => JSON.parse(body) as T;

async function createBooking(payload: Record<string, unknown>, auth = token) {
    return app.inject({ method: 'POST',
url: '/admin/room-bookings',
headers: bearer(auth),
payload });
}

beforeAll(async () => {
    prisma = createTestPrisma();
    await cleanDatabase(prisma);
    await seedSuperAdmin(prisma);
    app = await createTestApp(prisma);
    token = await loginAndGetToken(app);

    const readRule = await prisma.rule.create({
        data: { name: 'SO_LEITURA_CURSOS',
description: 'E2E',
permissions: ['READ_COURSE'] },
    });
    const person = await prisma.userData.create({ data: { name: 'Leitor',
phone: '44900000009' } });
    await prisma.userAdmin.create({
        data: {
            username: 'leitorcursos',
            passwordHash: await hash('leitorPass123!', 4),
            userDataId: person.id,
            rulesId: readRule.id,
        },
    });
    readOnlyToken = await loginAndGetToken(app, 'leitorcursos', 'leitorPass123!');

    const room = await app.inject({
        method: 'POST',
        url: '/rooms',
        headers: bearer(token),
        payload: { name: 'AUDITORIO',
description: 'E2E',
maxCapacity: 50 },
    });
    expect(room.statusCode, room.body).toBe(201);
    roomId = json<{ id: string }>(room.body).id;
    const other = await app.inject({
        method: 'POST',
        url: '/rooms',
        headers: bearer(token),
        payload: { name: 'SALA 1',
description: 'E2E',
maxCapacity: 20 },
    });
    otherRoomId = json<{ id: string }>(other.body).id;

    // Curso em 05/10/2030 08:00–12:00 no auditório.
    const course = await app.inject({
        method: 'POST',
        url: '/courses',
        headers: bearer(token),
        payload: {
            name: 'Curso de Irrigação',
            description: 'E2E',
            status: 'PUBLIC',
            roomId,
            startTime: '2030-10-05T08:00:00.000Z',
            endTime: '2030-10-05T12:00:00.000Z',
        },
    });
    expect(course.statusCode, course.body).toBe(201);
    courseId = json<{ id: string }>(course.body).id;
});

afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
});

describe('POST /admin/room-bookings', () => {
    it('cria uma reserva e devolve na listagem com o formato completo', async () => {
        const person = await prisma.userData.create({ data: { name: 'Maria Responsável',
phone: '44911111111' } });
        const res = await createBooking({
            type: 'MEETING',
            title: 'Reunião da diretoria',
            description: 'Pauta anual',
            roomId,
            // Encosta no fim do curso (12:00): permitido.
            startTime: '2030-10-05T12:00:00.000Z',
            endTime: '2030-10-05T14:00:00.000Z',
            responsibleUserDataId: person.id,
        });
        expect(res.statusCode, res.body).toBe(201);
        const body = json<{
 ids: string[];
seriesId: string | null 
}>(res.body);
        expect(body.ids).toHaveLength(1);
        expect(body.seriesId).toBeNull();

        const list = await app.inject({
            method: 'GET',
            url: '/admin/room-bookings?from=2030-10-05&to=2030-10-05',
            headers: bearer(token),
        });
        expect(list.statusCode, list.body).toBe(200);
        const items = json<Booking[]>(list.body);
        expect(items).toHaveLength(1);
        expect(items[0]).toEqual({
            id: body.ids[0],
            type: 'MEETING',
            title: 'Reunião da diretoria',
            description: 'Pauta anual',
            roomId,
            roomName: 'AUDITORIO',
            startTime: '2030-10-05T12:00:00.000Z',
            endTime: '2030-10-05T14:00:00.000Z',
            responsible: { id: person.id,
name: 'Maria Responsável' },
            responsibleName: null,
            seriesId: null,
        });
    });

    it('conflito com curso → 409 nomeando o curso', async () => {
        const res = await createBooking({
            type: 'EVENT',
            title: 'Palestra',
            roomId,
            startTime: '2030-10-05T11:00:00.000Z',
            endTime: '2030-10-05T12:00:00.000Z',
        });
        expect(res.statusCode, res.body).toBe(409);
        expect(json<{ error: string }>(res.body).error).toBe('Sala ocupada: Curso "Curso de Irrigação" em 05/10 08:00–12:00');
    });

    it('conflito com reserva → 409 nomeando a reunião; outra sala no mesmo horário pode', async () => {
        const res = await createBooking({
            type: 'EVENT',
            title: 'Palestra',
            roomId,
            startTime: '2030-10-05T13:59:00.000Z',
            endTime: '2030-10-05T15:00:00.000Z',
        });
        expect(res.statusCode, res.body).toBe(409);
        expect(json<{ error: string }>(res.body).error).toBe('Sala ocupada: Reunião "Reunião da diretoria" em 05/10 12:00–14:00');

        const elsewhere = await createBooking({
            type: 'EVENT',
            title: 'Palestra',
            roomId: otherRoomId,
            startTime: '2030-10-05T13:59:00.000Z',
            endTime: '2030-10-05T15:00:00.000Z',
            responsibleName: 'Fulano de fora',
        });
        expect(elsewhere.statusCode, elsewhere.body).toBe(201);
    });

    it('validação: término antes do início → 400', async () => {
        const res = await createBooking({
            type: 'EVENT',
            title: 'Errado',
            roomId,
            startTime: '2030-11-01T10:00:00.000Z',
            endTime: '2030-11-01T09:00:00.000Z',
        });
        expect(res.statusCode).toBe(400);
    });

    it('série com uma ocorrência em conflito não cria nada', async () => {
        // 21/09 → 12/10: a de 05/10 às 08:00 bate com o curso.
        const res = await createBooking({
            type: 'MEETING',
            title: 'Semanal que bate',
            roomId,
            startTime: '2030-09-21T09:00:00.000Z',
            endTime: '2030-09-21T10:00:00.000Z',
            repeat: { frequency: 'WEEKLY',
until: '2030-10-12' },
        });
        // 21/09/2030 é sábado; +14 dias = 05/10.
        expect(res.statusCode, res.body).toBe(409);
        expect(await prisma.roomBooking.count({ where: { title: 'Semanal que bate' } })).toBe(0);
    });
});

describe('série semanal e exclusão', () => {
    let ids: string[] = [];
    let seriesId: string;

    it('cria N ocorrências com o mesmo seriesId', async () => {
        const res = await createBooking({
            type: 'MEETING',
            title: 'Reunião semanal',
            roomId: otherRoomId,
            startTime: '2030-11-04T19:00:00.000Z',
            endTime: '2030-11-04T21:00:00.000Z',
            repeat: { frequency: 'WEEKLY',
until: '2030-12-02' },
        });
        expect(res.statusCode, res.body).toBe(201);
        const body = json<{
 ids: string[];
seriesId: string 
}>(res.body);
        expect(body.ids).toHaveLength(5);
        expect(body.seriesId).toBeTruthy();
        ids = body.ids;
        seriesId = body.seriesId;

        const list = await app.inject({
            method: 'GET',
            url: `/admin/room-bookings?from=2030-11-01&to=2030-12-31&roomId=${otherRoomId}&type=MEETING&search=semanal`,
            headers: bearer(token),
        });
        const items = json<Booking[]>(list.body);
        expect(items.map(i => i.startTime.slice(0, 10))).toEqual(['2030-11-04', '2030-11-11', '2030-11-18', '2030-11-25', '2030-12-02']);
        expect(items.every(i => i.seriesId === seriesId)).toBe(true);
    });

    it('PATCH muda só uma ocorrência', async () => {
        const res = await app.inject({
            method: 'PATCH',
            url: `/admin/room-bookings/${ids[1]}`,
            headers: bearer(token),
            payload: { title: 'Reunião semanal (adiada)',
startTime: '2030-11-11T20:00:00.000Z',
endTime: '2030-11-11T22:00:00.000Z' },
        });
        expect(res.statusCode, res.body).toBe(200);
        const b = json<Booking>(res.body);
        expect(b).toMatchObject({ id: ids[1],
title: 'Reunião semanal (adiada)',
startTime: '2030-11-11T20:00:00.000Z',
seriesId,
roomName: 'SALA 1' });
        const untouched = await prisma.roomBooking.findUnique({ where: { id: ids[2] } });
        expect(untouched?.title).toBe('Reunião semanal');
    });

    it('DELETE scope=future exclui esta e as seguintes', async () => {
        const res = await app.inject({
            method: 'DELETE',
            url: `/admin/room-bookings/${ids[2]}?scope=future`,
            headers: bearer(token),
        });
        expect(res.statusCode, res.body).toBe(200);
        expect(json<{ deleted: number }>(res.body).deleted).toBe(3);
        const left = await prisma.roomBooking.findMany({ where: { seriesId,
isDeleted: false },
select: { id: true } });
        expect(left.map(l => l.id).sort()).toEqual([ids[0], ids[1]].sort());

        const one = await app.inject({ method: 'DELETE',
url: `/admin/room-bookings/${ids[0]}`,
headers: bearer(token) });
        expect(json<{ deleted: number }>(one.body).deleted).toBe(1);
        const again = await app.inject({ method: 'DELETE',
url: `/admin/room-bookings/${ids[0]}`,
headers: bearer(token) });
        expect(again.statusCode).toBe(404);
    });
});

describe('cursos respeitam as reservas', () => {
    // POST /courses responde 400 em qualquer erro (status de sempre); PATCH usa 409.
    it('criar curso sobre uma reserva → recusado nomeando a reserva', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/courses',
            headers: bearer(token),
            payload: {
                name: 'Curso por cima',
                description: 'E2E',
                roomId,
                startTime: '2030-10-05T13:00:00.000Z',
                endTime: '2030-10-05T17:00:00.000Z',
            },
        });
        expect(res.statusCode, res.body).toBe(400);
        expect(json<{ error: string }>(res.body).error).toBe('Sala ocupada: Reunião "Reunião da diretoria" em 05/10 12:00–14:00');
    });

    it('editar o próprio curso sem mudar horário continua podendo; mover para cima da reserva → 409', async () => {
        const ok = await app.inject({
            method: 'PATCH',
            url: `/courses/${courseId}`,
            headers: bearer(token),
            payload: { startTime: '2030-10-05T07:00:00.000Z' },
        });
        expect(ok.statusCode, ok.body).toBe(200);
        const bad = await app.inject({
            method: 'PATCH',
            url: `/courses/${courseId}`,
            headers: bearer(token),
            payload: { endTime: '2030-10-05T13:00:00.000Z' },
        });
        expect(bad.statusCode).toBe(409);
    });
});

describe('GET /admin/room-schedule', () => {
    it('devolve cursos e reservas do período, por início', async () => {
        const res = await app.inject({
            method: 'GET',
            url: `/admin/room-schedule?from=2030-10-05&to=2030-10-05&roomId=${roomId}`,
            headers: bearer(token),
        });
        expect(res.statusCode, res.body).toBe(200);
        const items = json<{
 kind: string;
title: string;
status: string | null;
roomName: string;
seriesId: string | null 
}[]>(res.body);
        expect(items.map(i => [i.kind, i.title])).toEqual([
            ['COURSE', 'Curso de Irrigação'],
            ['MEETING', 'Reunião da diretoria'],
        ]);
        expect(items[0]).toMatchObject({ status: 'PUBLIC',
roomName: 'AUDITORIO',
seriesId: null });
        expect(items[1].status).toBeNull();
    });

    it('sem período → 400', async () => {
        const res = await app.inject({ method: 'GET',
url: '/admin/room-schedule',
headers: bearer(token) });
        expect(res.statusCode).toBe(400);
    });
});

describe('exportação e permissões', () => {
    it('exporta reservas em CSV com os filtros', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/admin/export/room-bookings',
            headers: bearer(token),
            payload: { from: '2030-10-01',
to: '2030-10-31' },
        });
        expect(res.statusCode, res.body).toBe(200);
        expect(res.body).toContain('"Tipo";"Título";"Sala";"Início";"Término";"Responsável";"Descrição";"Série"');
        expect(res.body).toContain('"Reunião";"Reunião da diretoria";"AUDITORIO";"05/10/2030 12:00";"05/10/2030 14:00";"Maria Responsável";"Pauta anual";"Não"');
        expect(res.body).toContain('"Evento";"Palestra";"SALA 1"');
        expect(res.headers['x-export-count']).toBe('2');
    });

    it('só leitura: lista e agenda 200, criar 403, sem token 401', async () => {
        const list = await app.inject({
            method: 'GET',
            url: '/admin/room-bookings?from=2030-10-01&to=2030-10-31',
            headers: bearer(readOnlyToken),
        });
        expect(list.statusCode).toBe(200);
        const create = await createBooking(
            { type: 'EVENT',
title: 'Sem permissão',
roomId,
startTime: '2031-01-01T08:00:00.000Z',
endTime: '2031-01-01T09:00:00.000Z' },
            readOnlyToken,
        );
        expect(create.statusCode).toBe(403);
        const anon = await app.inject({ method: 'GET',
url: '/admin/room-schedule?from=2030-10-01&to=2030-10-31' });
        expect(anon.statusCode).toBe(401);
    });

    it('sala com reserva futura não pode ser removida', async () => {
        const res = await app.inject({ method: 'DELETE',
url: `/rooms/${otherRoomId}`,
headers: bearer(token) });
        expect(res.statusCode, res.body).toBe(409);
        expect(json<{ error: string }>(res.body).error).toContain('reservas');
    });
});
