/**
 * Agendamento de notícia e eventos no site — E2E.
 *
 * Cobre: notícia agendada fica fora da lista e da página pública até a hora
 * chegar; filtros e busca do painel; evento marcado "Mostrar no site" aparece
 * em GET /events (reunião nunca aparece, evento que já terminou some, e as
 * observações internas não vazam).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '../generated/prisma/client.js';
import { createTestApp } from './helpers/create-test-app.js';
import { createTestPrisma, cleanDatabase, seedSuperAdmin, loginAndGetToken, bearer } from './helpers/db.js';

let app: FastifyInstance;
let prisma: PrismaClient;
let token: string;
let roomId: string;

type News = {
    id: string;
    title: string;
    status: string;
    publishAt: string | null;
    publishedAt: string | null;
};

type Paged<T> = {
 data: T[];
total: number 
};

type PublicEvent = {
    id: string;
    title: string;
    description: string | null;
    startTime: string;
    endTime: string;
    roomName: string;
};

const json = <T>(body: string) => JSON.parse(body) as T;

// Horários "de parede" de Brasília rotulados em UTC (como os cursos).
const FUTURE = '2030-10-05T08:00:00.000Z';
const PAST = '2020-10-05T08:00:00.000Z';

async function createNews(payload: Record<string, unknown>) {
    const res = await app.inject({ method: 'POST',
url: '/news',
headers: bearer(token),
payload });
    expect(res.statusCode, res.body).toBe(201);
    return json<{ id: string }>(res.body).id;
}

async function createBooking(payload: Record<string, unknown>) {
    const res = await app.inject({ method: 'POST',
url: '/admin/room-bookings',
headers: bearer(token),
payload });
    expect(res.statusCode, res.body).toBe(201);
    return json<{ ids: string[] }>(res.body).ids[0];
}

const publicEvents = async () => {
    const res = await app.inject({ method: 'GET',
url: '/events' });
    expect(res.statusCode, res.body).toBe(200);
    return json<PublicEvent[]>(res.body);
};

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
description: 'E2E',
maxCapacity: 50 },
    });
    expect(room.statusCode, room.body).toBe(201);
    roomId = json<{ id: string }>(room.body).id;
});

afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
});

describe('agendamento de notícia', () => {
    it('agendada não aparece na lista nem na página pública', async () => {
        const id = await createNews({
            title: 'Assembleia agendada',
            content: '[]',
            status: 'PUBLISHED',
            publishAt: FUTURE,
        });

        const list = await app.inject({ method: 'GET',
url: '/news' });
        expect(list.statusCode).toBe(200);
        expect(json<Paged<News>>(list.body).data.some(n => n.id === id)).toBe(false);

        // Nem com o link direto.
        const detail = await app.inject({ method: 'GET',
url: `/news/${id}` });
        expect(detail.statusCode).toBe(404);
    });

    it('com agendamento no passado já está no ar', async () => {
        const id = await createNews({
            title: 'Assembleia de ontem',
            content: '[]',
            status: 'PUBLISHED',
            publishAt: PAST,
        });
        const list = await app.inject({ method: 'GET',
url: '/news' });
        expect(json<Paged<News>>(list.body).data.some(n => n.id === id)).toBe(true);
        const detail = await app.inject({ method: 'GET',
url: `/news/${id}` });
        expect(detail.statusCode).toBe(200);
        // A data mostrada ao leitor é a do agendamento.
        expect(json<News>(detail.body).publishedAt?.slice(0, 10)).toBe(PAST.slice(0, 10));
    });

    it('publicar agora (publishAt null) coloca a agendada no ar', async () => {
        const id = await createNews({
            title: 'Comunicado adiantado',
            content: '[]',
            status: 'PUBLISHED',
            publishAt: FUTURE,
        });
        const patch = await app.inject({
            method: 'PATCH',
            url: `/news/${id}`,
            headers: bearer(token),
            payload: { publishAt: null },
        });
        expect(patch.statusCode, patch.body).toBe(200);
        const detail = await app.inject({ method: 'GET',
url: `/news/${id}` });
        expect(detail.statusCode).toBe(200);
        expect(json<News>(detail.body).publishAt).toBeNull();
    });

    it('voltar para rascunho descarta o agendamento e tira do site', async () => {
        const id = await createNews({
            title: 'Comunicado recolhido',
            content: '[]',
            status: 'PUBLISHED',
            publishAt: PAST,
        });
        const patch = await app.inject({
            method: 'PATCH',
            url: `/news/${id}`,
            headers: bearer(token),
            payload: { status: 'UNPUBLISHED' },
        });
        expect(patch.statusCode, patch.body).toBe(200);
        const detail = await app.inject({ method: 'GET',
url: `/news/${id}` });
        expect(detail.statusCode).toBe(404);
        const row = await prisma.news.findUnique({ where: { id } });
        expect(row?.publishAt).toBeNull();
    });

    it('painel filtra por agendadas / publicadas / rascunhos e busca por título', async () => {
        await createNews({ title: 'Rascunho do mutirão',
content: '[]',
status: 'UNPUBLISHED' });

        const scheduled = await app.inject({
            method: 'GET',
            url: '/admin/news?status=SCHEDULED',
            headers: bearer(token),
        });
        expect(scheduled.statusCode, scheduled.body).toBe(200);
        const scheduledRows = json<Paged<News>>(scheduled.body).data;
        expect(scheduledRows.length).toBeGreaterThan(0);
        expect(scheduledRows.every(n => n.publishAt !== null)).toBe(true);
        expect(scheduledRows.some(n => n.title === 'Assembleia agendada')).toBe(true);

        const published = await app.inject({
            method: 'GET',
            url: '/admin/news?status=PUBLISHED',
            headers: bearer(token),
        });
        expect(json<Paged<News>>(published.body).data.some(n => n.title === 'Assembleia agendada')).toBe(false);

        const drafts = await app.inject({
            method: 'GET',
            url: '/admin/news?status=UNPUBLISHED',
            headers: bearer(token),
        });
        expect(json<Paged<News>>(drafts.body).data.every(n => n.status === 'UNPUBLISHED')).toBe(true);

        const search = await app.inject({
            method: 'GET',
            url: '/admin/news?search=mutir',
            headers: bearer(token),
        });
        const found = json<Paged<News>>(search.body).data;
        expect(found).toHaveLength(1);
        expect(found[0].title).toBe('Rascunho do mutirão');
    });
});

describe('GET /events (eventos no site)', () => {
    it('evento marcado aparece com sala, horário e texto público', async () => {
        const id = await createBooking({
            type: 'EVENT',
            title: 'DIA DE CAMPO',
            roomId,
            startTime: FUTURE,
            endTime: '2030-10-05T12:00:00.000Z',
            description: 'Observações internas da equipe',
            publicOnSite: true,
            publicDescription: 'Encontro aberto aos associados',
        });

        const events = await publicEvents();
        const found = events.find(e => e.id === id);
        expect(found).toBeDefined();
        expect(found?.title).toBe('DIA DE CAMPO');
        expect(found?.roomName).toBe('AUDITORIO');
        expect(found?.startTime.slice(0, 16)).toBe(FUTURE.slice(0, 16));
        // O texto público é o que aparece — as observações internas não vazam.
        expect(found?.description).toBe('Encontro aberto aos associados');
        expect(JSON.stringify(found)).not.toContain('Observações internas');
    });

    it('rota é pública (sem token) e não exige permissão', async () => {
        const res = await app.inject({ method: 'GET',
url: '/events' });
        expect(res.statusCode).toBe(200);
    });

    it('reunião nunca vai para o site, mesmo marcada', async () => {
        const id = await createBooking({
            type: 'MEETING',
            title: 'REUNIAO DA DIRETORIA',
            roomId,
            startTime: '2030-10-06T08:00:00.000Z',
            endTime: '2030-10-06T10:00:00.000Z',
            publicOnSite: true,
        });
        expect((await publicEvents()).some(e => e.id === id)).toBe(false);
        const row = await prisma.roomBooking.findUnique({ where: { id } });
        expect(row?.publicOnSite).toBe(false);
    });

    it('evento não marcado fica fora e marcar depois coloca no site', async () => {
        const id = await createBooking({
            type: 'EVENT',
            title: 'LEILAO',
            roomId,
            startTime: '2030-10-07T08:00:00.000Z',
            endTime: '2030-10-07T10:00:00.000Z',
        });
        expect((await publicEvents()).some(e => e.id === id)).toBe(false);

        const patch = await app.inject({
            method: 'PATCH',
            url: `/admin/room-bookings/${id}`,
            headers: bearer(token),
            payload: { publicOnSite: true },
        });
        expect(patch.statusCode, patch.body).toBe(200);
        expect((await publicEvents()).some(e => e.id === id)).toBe(true);
    });

    it('evento que já terminou não aparece', async () => {
        const id = await createBooking({
            type: 'EVENT',
            title: 'EVENTO ANTIGO',
            roomId,
            startTime: PAST,
            endTime: '2020-10-05T12:00:00.000Z',
            publicOnSite: true,
        });
        expect((await publicEvents()).some(e => e.id === id)).toBe(false);
    });

    it('vem em ordem de início', async () => {
        const events = await publicEvents();
        const starts = events.map(e => e.startTime);
        expect([...starts].sort()).toEqual(starts);
    });
});
