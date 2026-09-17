import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { hash } from 'bcrypt';
import type { PrismaClient } from '../generated/prisma/client.js';
import { createTestApp } from './helpers/create-test-app.js';
import { createTestPrisma, cleanDatabase, seedSuperAdmin, loginAndGetToken, bearer } from './helpers/db.js';

// Sino do painel contra o Postgres de verdade: inscrição pública, mensagem de
// contato e convite aceito geram eventos; cada admin só vê os tipos que a
// regra permite; marcar uma / todas como lidas; leitura é por admin e não
// entra na auditoria.

type EventItem = {
    id: string;
    type: string;
    title: string;
    body: string | null;
    link: string | null;
    createdAt: string;
    read: boolean;
};
type Bell = {
 unreadCount: number;
pendingCount: number;
events: EventItem[];
pending: unknown[] 
};

let app: FastifyInstance;
let prisma: PrismaClient;
let superToken: string;
let courseOnlyToken: string;
let contactOnlyToken: string;
const ids: Record<string, string> = {};

async function createLimitedAdmin(username: string, permissions: string[]) {
    const rule = await prisma.rule.create({
        data: { name: `RULE_${username}`,
description: 'e2e',
permissions: permissions as never },
    });
    const person = await prisma.userData.create({
        data: { name: `ADMIN ${username.toUpperCase()}`,
phone: '44900000001' },
    });
    await prisma.userAdmin.create({
        data: { username,
passwordHash: await hash('limitedPass123!', 4),
userDataId: person.id,
rulesId: rule.id },
    });
    return loginAndGetToken(app, username, 'limitedPass123!');
}

async function bell(token: string): Promise<Bell> {
    const res = await app.inject({ method: 'GET',
url: '/admin/notifications',
headers: bearer(token) });
    expect(res.statusCode, res.body).toBe(200);
    return JSON.parse(res.body) as Bell;
}

beforeAll(async () => {
    prisma = createTestPrisma();
    await cleanDatabase(prisma);
    const { rule } = await seedSuperAdmin(prisma);
    ids.superRule = rule.id;
    app = await createTestApp(prisma);
    superToken = await loginAndGetToken(app);
    courseOnlyToken = await createLimitedAdmin('courseonly', ['READ_COURSE']);
    contactOnlyToken = await createLimitedAdmin('contactonly', ['READ_CONTACT']);

    const room = await prisma.room.create({ data: { name: 'SALA 1',
description: 'x',
maxCapacity: 20 } });
    const course = await prisma.course.create({
        data: {
            name: 'CURSO NOTIFICACAO',
            description: 'x',
            roomId: room.id,
            status: 'PUBLIC',
            startTime: new Date('2032-05-10T08:00:00Z'),
            endTime: new Date('2032-05-12T17:00:00Z'),
        },
    });
    ids.course = course.id;
});

afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
});

describe('Notificações do painel', () => {
    it('exige login', async () => {
        const res = await app.inject({ method: 'GET',
url: '/admin/notifications' });
        expect(res.statusCode).toBe(401);
    });

    it('começa vazio, com a lista de pendências presente', async () => {
        const body = await bell(superToken);
        expect(body.events).toEqual([]);
        expect(body.unreadCount).toBe(0);
        expect(Array.isArray(body.pending)).toBe(true);
        expect(body.pendingCount).toBe(body.pending.length);
    });

    it('inscrição pública gera evento visível só para quem tem READ_COURSE', async () => {
        const res = await app.inject({
            method: 'POST',
            url: `/courses/${ids.course}/register`,
            payload: { name: 'JOAO NOTIFICADO',
phone: '44911112222',
cpf: '52998224725' },
        });
        expect(res.statusCode, res.body).toBe(201);

        const reg = await prisma.courseUserRegistration.findFirstOrThrow({ where: { courseId: ids.course } });
        const forCourse = await bell(courseOnlyToken);
        expect(forCourse.unreadCount).toBe(1);
        expect(forCourse.events).toHaveLength(1);
        expect(forCourse.events[0]).toMatchObject({
            type: 'COURSE_REGISTRATION',
            title: 'Nova inscrição em CURSO NOTIFICACAO',
            body: 'JOAO NOTIFICADO',
            link: `/admin/cursos?curso=${ids.course}&aba=inscricoes`,
            read: false,
        });
        expect(Number.isNaN(Date.parse(forCourse.events[0].createdAt))).toBe(false);
        const stored = await prisma.notification.findUniqueOrThrow({ where: { id: forCourse.events[0].id } });
        expect(stored.entityId).toBe(reg.id);

        const forContact = await bell(contactOnlyToken);
        expect(forContact.events).toEqual([]);
        expect(forContact.unreadCount).toBe(0);
    });

    it('mensagem de contato gera evento para quem tem READ_CONTACT', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/contacts/message',
            payload: { name: 'Maria Contato',
email: 'maria@contato.com',
subject: 'Dúvida',
message: 'Olá' },
        });
        expect(res.statusCode, res.body).toBe(201);

        const forContact = await bell(contactOnlyToken);
        expect(forContact.events).toHaveLength(1);
        expect(forContact.events[0]).toMatchObject({
            type: 'CONTACT_MESSAGE',
            title: 'Nova mensagem de Maria Contato',
            body: 'Dúvida',
            link: '/admin/mensagens',
            read: false,
        });
        expect((await bell(courseOnlyToken)).events.map(e => e.type)).toEqual(['COURSE_REGISTRATION']);
    });

    it('convite aceito gera evento para quem tem READ_USER_ADMIN (o gestor vê os três, mais recente primeiro)', async () => {
        const person = await prisma.userData.create({ data: { name: 'ANA CONVIDADA',
phone: '44900000009' } });
        const invite = await app.inject({
            method: 'POST',
            url: '/admin/invites',
            headers: bearer(superToken),
            payload: { userDataId: person.id,
rulesId: ids.superRule },
        });
        expect(invite.statusCode, invite.body).toBe(201);
        const { token } = JSON.parse(invite.body) as { token: string };
        const accept = await app.inject({
            method: 'POST',
            url: `/invites/${token}/accept`,
            payload: { username: 'ana.convidada',
password: 'senhaForte123' },
        });
        expect(accept.statusCode, accept.body).toBe(200);

        const all = await bell(superToken);
        expect(all.events.map(e => e.type)).toEqual(['INVITE_ACCEPTED', 'CONTACT_MESSAGE', 'COURSE_REGISTRATION']);
        expect(all.events[0]).toMatchObject({
            title: 'ANA CONVIDADA ativou o acesso ao painel',
            body: null,
            link: '/admin/usuarios?tab=admins',
        });
        expect(all.unreadCount).toBe(3);
        expect((await bell(courseOnlyToken)).events).toHaveLength(1);
    });

    it('marca uma como lida só para o próprio admin, sem auditoria', async () => {
        const before = await bell(superToken);
        const target = before.events.find(e => e.type === 'CONTACT_MESSAGE')!;

        const res = await app.inject({
            method: 'PATCH',
            url: '/admin/notifications/read',
            headers: bearer(superToken),
            payload: { ids: [target.id] },
        });
        expect(res.statusCode, res.body).toBe(200);
        expect(JSON.parse(res.body)).toEqual({ updated: 1 });

        const after = await bell(superToken);
        expect(after.unreadCount).toBe(2);
        expect(after.events.find(e => e.id === target.id)?.read).toBe(true);

        // Repetir não conta de novo; a leitura do gestor não vale para outro admin.
        const again = await app.inject({
            method: 'PATCH',
            url: '/admin/notifications/read',
            headers: bearer(superToken),
            payload: { ids: [target.id] },
        });
        expect(JSON.parse(again.body)).toEqual({ updated: 0 });
        expect((await bell(contactOnlyToken)).unreadCount).toBe(1);

        const audit = await prisma.auditLog.count({ where: { path: '/admin/notifications/read' } });
        expect(audit).toBe(0);
    });

    it('não marca evento que o admin não pode ver', async () => {
        const all = await bell(superToken);
        const contactEvent = all.events.find(e => e.type === 'CONTACT_MESSAGE')!;
        const res = await app.inject({
            method: 'PATCH',
            url: '/admin/notifications/read',
            headers: bearer(courseOnlyToken),
            payload: { ids: [contactEvent.id] },
        });
        expect(res.statusCode, res.body).toBe(200);
        expect(JSON.parse(res.body)).toEqual({ updated: 0 });
    });

    it('sem ids marca todas as visíveis (corpo vazio também vale)', async () => {
        const res = await app.inject({
            method: 'PATCH',
            url: '/admin/notifications/read',
            headers: bearer(superToken),
            payload: {},
        });
        expect(res.statusCode, res.body).toBe(200);
        expect(JSON.parse(res.body)).toEqual({ updated: 2 });
        const after = await bell(superToken);
        expect(after.unreadCount).toBe(0);
        expect(after.events.every(e => e.read)).toBe(true);

        const noBody = await app.inject({
            method: 'PATCH',
            url: '/admin/notifications/read',
            headers: bearer(courseOnlyToken),
        });
        expect(noBody.statusCode, noBody.body).toBe(200);
        expect(JSON.parse(noBody.body)).toEqual({ updated: 1 });
        expect((await bell(courseOnlyToken)).unreadCount).toBe(0);
    });

    it('eventos com mais de 30 dias saem do sino', async () => {
        await prisma.notification.create({
            data: {
                type: 'CONTACT_MESSAGE',
                title: 'Antiga',
                permission: 'READ_CONTACT',
                createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
            },
        });
        const body = await bell(contactOnlyToken);
        expect(body.events.map(e => e.title)).not.toContain('Antiga');
        expect(body.unreadCount).toBe(1);
    });
});
