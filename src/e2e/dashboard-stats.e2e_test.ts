/**
 * Painel Geral — E2E.
 *
 * Cobre: os números de `GET /admin/dashboard/stats` com dados semeados, o
 * filtro por permissão (cada bloco só aparece para quem pode ver), os campos de
 * curso da agenda (`GET /admin/room-schedule`) e o vai e volta das preferências
 * (`GET /admin/me` + `PATCH /admin/me/preferences`).
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
let courseToken: string;
let userToken: string;
let roomId: string;
let smallRoomId: string;
let publicCourseId: string;
let unpublishedCourseId: string;
let completedCourseId: string;

const json = <T>(body: string) => JSON.parse(body) as T;

const DAY_MS = 24 * 60 * 60 * 1000;
const BRASILIA_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Hoje em Brasília como meia-noite com Z (mesmo formato das datas do curso). */
function today(): Date {
    const wall = new Date(Date.now() - BRASILIA_OFFSET_MS);
    return new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate()));
}
const plusDays = (days: number) => new Date(today().getTime() + days * DAY_MS);
/** Hora "de parede" naquele dia. */
const at = (days: number, hour: number) => new Date(plusDays(days).getTime() + hour * 60 * 60 * 1000);

type Stats = {
    courses?: {
        total: number;
        public: number;
        private: number;
        unpublished: number;
        inProgress: number;
        completed: number;
    };
    totalRooms?: number;
    registrations?: {
        last30Days: number;
        pendingConfirmation: number;
    };
    coursesStartingIn7Days?: number;
    totalRegistrations?: number;
    registrationsLast30Days?: number;
    totalUsers?: number;
    membershipsExpiring30Days?: number;
    totalAdmins?: number;
    unreadMessages?: number;
    quotesToday?: {
        launched: boolean;
        period: string | null;
    };
};

type ScheduleItem = {
    kind: string;
    id: string;
    title: string;
    status: string | null;
    enrolled: number | null;
    maxStudents: number | null;
    registrationDeadline: string | null;
    registrationDeadlineTime: string | null;
};

const stats = async (auth: string) =>
    app.inject({ method: 'GET',
url: '/admin/dashboard/stats',
headers: bearer(auth) });

/** Admin com uma regra própria, para testar o filtro por permissão. */
async function seedAdmin(username: string, permissions: string[]): Promise<string> {
    const rule = await prisma.rule.create({
        data: { name: `REGRA_${username}`,
description: 'E2E',
permissions: permissions as never },
    });
    const person = await prisma.userData.create({ data: { name: `Admin ${username}`,
phone: '44900000001' } });
    await prisma.userAdmin.create({
        data: {
            username,
            passwordHash: await hash('e2ePassword123!', 4),
            userDataId: person.id,
            rulesId: rule.id,
        },
    });
    return loginAndGetToken(app, username, 'e2ePassword123!');
}

async function seedRegistration(courseId: string, name: string, confirmed: boolean) {
    const person = await prisma.userData.create({ data: { name,
phone: '44900000002' } });
    await prisma.courseUserRegistration.create({ data: { courseId,
userDataId: person.id,
confirmed } });
}

beforeAll(async () => {
    prisma = createTestPrisma();
    await cleanDatabase(prisma);
    // Os produtos de cotação vêm da migration (não são apagados pelo TRUNCATE):
    // só o histórico precisa começar limpo.
    await prisma.marketQuoteHistory.deleteMany({});
    await seedSuperAdmin(prisma);
    app = await createTestApp(prisma);
    token = await loginAndGetToken(app);

    courseToken = await seedAdmin('socursos', ['READ_COURSE']);
    userToken = await seedAdmin('sopessoas', ['READ_USER']);

    const room = await prisma.room.create({
        data: { name: 'AUDITORIO',
description: 'E2E',
maxCapacity: 50 },
    });
    roomId = room.id;
    const small = await prisma.room.create({
        data: { name: 'SALA 1',
description: 'E2E',
maxCapacity: 12 },
    });
    smallRoomId = small.id;

    // Cursos: um de cada status. Criados direto no banco para fixar as datas.
    const course = (
        name: string,
        status: string,
        startDays: number,
        endDays: number,
        extra: Record<string, unknown> = {},
    ) =>
        prisma.course.create({
            data: {
                name,
                description: 'E2E',
                status: status as never,
                roomId,
                startTime: at(startDays, 8),
                endTime: at(endDays, 12),
                ...extra,
            },
        });

    // Começa em 3 dias → entra em coursesStartingIn7Days.
    publicCourseId = (
        await course('Curso Público', 'PUBLIC', 3, 3, {
            // Prazo com hora: a agenda devolve dia + "HH:MM".
            registrationDeadline: at(2, 18),
        })
    ).id;
    // Começa em 20 dias → fora da janela de 7 dias.
    await course('Curso Privado', 'PRIVATE', 20, 20);
    unpublishedCourseId = (await course('Curso Rascunho', 'UNPUBLISHED', 5, 5)).id;
    await course('Curso em Andamento', 'IN_PROGRESS', -1, 1);
    completedCourseId = (await course('Curso Concluído', 'COMPLETED', -10, -9)).id;

    // Inscrições: 2 sem confirmar + 1 confirmada no curso que não terminou;
    // 1 sem confirmar no curso que já acabou (não conta como pendente).
    await seedRegistration(publicCourseId, 'Inscrito A', false);
    await seedRegistration(publicCourseId, 'Inscrito B', false);
    await seedRegistration(publicCourseId, 'Inscrito C', true);
    await seedRegistration(completedCourseId, 'Inscrito Antigo', false);

    // Associações: uma vencendo dentro de 30 dias, uma fora, uma inativa.
    await prisma.userData.create({
        data: {
            name: 'Associado Vencendo',
            phone: '44900000003',
            memberStatus: 'ACTIVE',
            membershipValidUntil: plusDays(10),
        },
    });
    await prisma.userData.create({
        data: {
            name: 'Associado Tranquilo',
            phone: '44900000004',
            memberStatus: 'ACTIVE',
            membershipValidUntil: plusDays(60),
        },
    });
    await prisma.userData.create({
        data: {
            name: 'Associado Inativo',
            phone: '44900000005',
            memberStatus: 'INACTIVE',
            membershipValidUntil: plusDays(5),
        },
    });

    // Mensagens de contato: 2 não lidas + 1 lida.
    await prisma.contactMessage.createMany({
        data: [
            { name: 'Zé',
email: 'ze@test.local',
message: 'Oi',
read: false },
            { name: 'Ana',
email: 'ana@test.local',
message: 'Olá',
read: false },
            { name: 'Bia',
email: 'bia@test.local',
message: 'Bom dia',
read: true },
        ],
    });

    // Cotações de hoje: manhã e tarde lançadas (o último período é o da tarde).
    const quote = await prisma.marketQuote.findFirst({ where: { label: 'SOJA' } });
    if (quote) {
        await prisma.marketQuoteHistory.createMany({
            data: [
                { marketQuoteId: quote.id,
value: 'R$ 100,00',
numeric: 100,
referenceDate: today(),
period: 'MORNING' },
                { marketQuoteId: quote.id,
value: 'R$ 102,00',
numeric: 102,
referenceDate: today(),
period: 'AFTERNOON' },
            ],
        });
    }
});

afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
});

describe('GET /admin/dashboard/stats', () => {
    it('conta cursos, salas, inscrições, pessoas, admins, mensagens e cotações', async () => {
        const res = await stats(token);
        expect(res.statusCode, res.body).toBe(200);
        const body = json<Stats>(res.body);

        expect(body.courses).toEqual({
            total: 5,
            public: 1,
            private: 1,
            unpublished: 1,
            inProgress: 1,
            completed: 1,
        });
        expect(body.totalRooms).toBe(2);
        // Só os 2 sem confirmar do curso que ainda não terminou.
        expect(body.registrations).toEqual({ last30Days: 4,
pendingConfirmation: 2 });
        // Nomes antigos continuam vindo.
        expect(body.totalRegistrations).toBe(4);
        expect(body.registrationsLast30Days).toBe(4);
        // Só o público (3 dias); o privado começa em 20.
        expect(body.coursesStartingIn7Days).toBe(1);
        expect(body.membershipsExpiring30Days).toBe(1);
        expect(body.unreadMessages).toBe(2);
        expect(body.quotesToday).toEqual({ launched: true,
period: 'AFTERNOON' });
        // 3 admins (super + os dois de permissão limitada).
        expect(body.totalAdmins).toBe(3);
        expect(body.totalUsers).toBeGreaterThan(0);
    });

    it('sem token → 401', async () => {
        const res = await app.inject({ method: 'GET',
url: '/admin/dashboard/stats' });
        expect(res.statusCode).toBe(401);
    });

    it('só READ_COURSE: cursos e inscrições, sem pessoas, admins, mensagens nem cotações', async () => {
        const res = await stats(courseToken);
        expect(res.statusCode, res.body).toBe(200);
        const body = json<Stats>(res.body);
        expect(body.courses?.total).toBe(5);
        expect(body.totalRooms).toBe(2);
        expect(body.registrations?.pendingConfirmation).toBe(2);
        expect(body.totalUsers).toBeUndefined();
        expect(body.membershipsExpiring30Days).toBeUndefined();
        expect(body.totalAdmins).toBeUndefined();
        expect(body.unreadMessages).toBeUndefined();
        expect(body.quotesToday).toBeUndefined();
    });

    it('só READ_USER: 200 com pessoas e associações, sem o bloco de cursos', async () => {
        const res = await stats(userToken);
        expect(res.statusCode, res.body).toBe(200);
        const body = json<Stats>(res.body);
        expect(body.totalUsers).toBeGreaterThan(0);
        expect(body.membershipsExpiring30Days).toBe(1);
        expect(body.courses).toBeUndefined();
        expect(body.registrations).toBeUndefined();
        expect(body.totalRegistrations).toBeUndefined();
        expect(body.coursesStartingIn7Days).toBeUndefined();
        expect(body.totalRooms).toBeUndefined();
    });
});

describe('GET /admin/room-schedule — campos do curso para o calendário', () => {
    it('traz curso de qualquer status com inscritos, capacidade e prazo', async () => {
        const from = plusDays(-30).toISOString().slice(0, 10);
        const to = plusDays(30).toISOString().slice(0, 10);
        const res = await app.inject({
            method: 'GET',
            url: `/admin/room-schedule?from=${from}&to=${to}`,
            headers: bearer(token),
        });
        expect(res.statusCode, res.body).toBe(200);
        const items = json<ScheduleItem[]>(res.body);

        const publicCourse = items.find(i => i.id === publicCourseId);
        expect(publicCourse).toBeDefined();
        expect(publicCourse?.kind).toBe('COURSE');
        expect(publicCourse?.status).toBe('PUBLIC');
        expect(publicCourse?.enrolled).toBe(3);
        expect(publicCourse?.maxStudents).toBe(50);
        expect(publicCourse?.registrationDeadline).toBe(plusDays(2).toISOString().slice(0, 10));
        expect(publicCourse?.registrationDeadlineTime).toBe('18:00');

        // Rascunho e concluído também aparecem (o calendário é do painel).
        expect(items.find(i => i.id === unpublishedCourseId)?.status).toBe('UNPUBLISHED');
        expect(items.find(i => i.id === completedCourseId)?.status).toBe('COMPLETED');

        // Curso sem prazo: os dois campos do prazo vêm null.
        const noDeadline = items.find(i => i.id === unpublishedCourseId);
        expect(noDeadline?.registrationDeadline).toBeNull();
        expect(noDeadline?.registrationDeadlineTime).toBeNull();
    });

    it('reserva de sala vem com os campos de curso em null', async () => {
        const day = plusDays(4).toISOString().slice(0, 10);
        const created = await app.inject({
            method: 'POST',
            url: '/admin/room-bookings',
            headers: bearer(token),
            payload: {
                type: 'MEETING',
                title: 'Reunião da diretoria',
                roomId: smallRoomId,
                startTime: at(4, 14).toISOString(),
                endTime: at(4, 16).toISOString(),
            },
        });
        expect(created.statusCode, created.body).toBe(201);

        const res = await app.inject({
            method: 'GET',
            url: `/admin/room-schedule?from=${day}&to=${day}&roomId=${smallRoomId}`,
            headers: bearer(token),
        });
        expect(res.statusCode, res.body).toBe(200);
        const items = json<ScheduleItem[]>(res.body);
        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({
            kind: 'MEETING',
            status: null,
            enrolled: null,
            maxStudents: null,
            registrationDeadline: null,
            registrationDeadlineTime: null,
        });
    });
});

describe('Preferências do painel', () => {
    type Me = { dashboardPrefs: Record<string, unknown> | null };

    const me = (auth: string) =>
        app.inject({ method: 'GET',
url: '/admin/me',
headers: bearer(auth) });
    const savePrefs = (auth: string, payload: Record<string, unknown>) =>
        app.inject({ method: 'PATCH',
url: '/admin/me/preferences',
headers: bearer(auth),
payload });

    it('começa null, grava e volta em GET /admin/me', async () => {
        const before = await me(token);
        expect(before.statusCode, before.body).toBe(200);
        expect(json<Me>(before.body).dashboardPrefs).toBeNull();

        const prefs = { hiddenCards: ['quotes'],
calendarRoomId: null,
compact: true };
        const saved = await savePrefs(token, { dashboardPrefs: prefs });
        expect(saved.statusCode, saved.body).toBe(200);
        expect(json<Me>(saved.body).dashboardPrefs).toEqual(prefs);

        const after = await me(token);
        expect(json<Me>(after.body).dashboardPrefs).toEqual(prefs);
    });

    it('substitui o objeto inteiro e não vaza para outro admin', async () => {
        const replaced = await savePrefs(token, { dashboardPrefs: { compact: false } });
        expect(replaced.statusCode, replaced.body).toBe(200);
        expect(json<Me>(replaced.body).dashboardPrefs).toEqual({ compact: false });

        const other = await me(courseToken);
        expect(json<Me>(other.body).dashboardPrefs).toBeNull();
    });

    it('recusa o que não é objeto e payload grande demais', async () => {
        for (const body of [{}, { dashboardPrefs: null }, { dashboardPrefs: [1] }, { dashboardPrefs: 'x' }]) {
            const res = await savePrefs(token, body);
            expect(res.statusCode, JSON.stringify(body)).toBe(400);
        }
        const big = await savePrefs(token, { dashboardPrefs: { blob: 'x'.repeat(5000) } });
        expect(big.statusCode, big.body).toBe(400);
    });

    it('sem token → 401', async () => {
        const res = await app.inject({
            method: 'PATCH',
            url: '/admin/me/preferences',
            payload: { dashboardPrefs: {} },
        });
        expect(res.statusCode).toBe(401);
    });
});
