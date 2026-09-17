import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '../generated/prisma/client.js';
import { createTestApp } from './helpers/create-test-app.js';
import { createTestPrisma, cleanDatabase, seedSuperAdmin, loginAndGetToken, bearer } from './helpers/db.js';

// Presença nas inscrições e status "Concluído" contra o Postgres de verdade:
// iniciar com inscrição pendente, marcar presente/falta/desmarcar, "Todos
// presentes" só nas confirmadas sem marcar, concluir só em andamento e curso
// concluído recusando inscrição pública.

let app: FastifyInstance;
let prisma: PrismaClient;
let token: string;
const ids: Record<string, string> = {};

type RegistrationItem = {
 id: string;
confirmed: boolean;
attended: boolean | null 
};

beforeAll(async () => {
    prisma = createTestPrisma();
    await cleanDatabase(prisma);
    await seedSuperAdmin(prisma);
    app = await createTestApp(prisma);
    token = await loginAndGetToken(app);

    const room = await prisma.room.create({ data: { name: 'SALA 2',
description: 'x',
maxCapacity: 20 } });
    const course = await prisma.course.create({
        data: {
            name: 'CURSO PRESENCA',
            description: 'x',
            roomId: room.id,
            status: 'PUBLIC',
            startTime: new Date('2032-05-10T08:00:00Z'),
            endTime: new Date('2032-05-12T17:00:00Z'),
        },
    });
    ids.course = course.id;

    const people = await Promise.all(
        ['ANA', 'BRUNO', 'CARLA', 'DANIEL'].map((name, i) =>
            prisma.userData.create({
                data: { name: `${name} PRESENCA`,
email: `${name.toLowerCase()}.presenca@test.com`,
phone: `4493333000${i}` },
            }),
        ),
    );
    // ANA, BRUNO e CARLA confirmadas; DANIEL pendente.
    const regs = await Promise.all(
        people.map((p, i) =>
            prisma.courseUserRegistration.create({
                data: { courseId: course.id,
userDataId: p.id,
confirmed: i < 3 },
            }),
        ),
    );
    [ids.ana, ids.bruno, ids.carla, ids.daniel] = regs.map(r => r.id);
});

afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
});

async function listRegistrations(): Promise<Map<string, RegistrationItem>> {
    const res = await app.inject({
        method: 'GET',
        url: `/admin/courses/${ids.course}/registrations?limit=100`,
        headers: bearer(token),
    });
    expect(res.statusCode, res.body).toBe(200);
    const items = (JSON.parse(res.body) as { data: RegistrationItem[] }).data;
    return new Map(items.map(r => [r.id, r]));
}

const patch = (url: string, payload?: object) =>
    app.inject({ method: 'PATCH',
url,
headers: bearer(token),
payload });

describe('Iniciar e concluir curso', () => {
    it('concluir antes de iniciar → 409', async () => {
        const res = await patch(`/admin/courses/${ids.course}/complete`);
        expect(res.statusCode, res.body).toBe(409);
        expect(JSON.parse(res.body).error).toBe('Só é possível concluir um curso que está em andamento.');
    });

    it('inicia com inscrição ainda não confirmada', async () => {
        const res = await app.inject({
            method: 'POST',
            url: `/admin/courses/${ids.course}/start`,
            headers: bearer(token),
        });
        expect(res.statusCode, res.body).toBe(200);
        const course = await prisma.course.findUnique({ where: { id: ids.course } });
        expect(course?.status).toBe('IN_PROGRESS');
    });
});

describe('Presença', () => {
    it('lista traz attended null para quem não foi marcado', async () => {
        const regs = await listRegistrations();
        expect(regs.get(ids.ana)?.attended).toBeNull();
    });

    it('marca presente, falta e desmarca', async () => {
        const url = `/admin/registrations/${ids.ana}/attendance`;

        let res = await patch(url, { attended: true });
        expect(res.statusCode, res.body).toBe(200);
        expect(JSON.parse(res.body)).toEqual({ id: ids.ana,
attended: true });

        res = await patch(url, { attended: false });
        expect(JSON.parse(res.body)).toEqual({ id: ids.ana,
attended: false });
        expect((await listRegistrations()).get(ids.ana)?.attended).toBe(false);

        res = await patch(url, { attended: null });
        expect(res.statusCode, res.body).toBe(200);
        expect(JSON.parse(res.body)).toEqual({ id: ids.ana,
attended: null });
        expect((await listRegistrations()).get(ids.ana)?.attended).toBeNull();
    });

    it('sem o campo → 400; inscrição inexistente → 404', async () => {
        const noBody = await patch(`/admin/registrations/${ids.ana}/attendance`, {});
        expect(noBody.statusCode).toBe(400);
        const missing = await patch('/admin/registrations/00000000-0000-0000-0000-000000000000/attendance', {
            attended: true,
        });
        expect(missing.statusCode).toBe(404);
    });

    it('"Todos presentes" só muda as confirmadas ainda sem marcar', async () => {
        // BRUNO já marcado como falta: continua falta.
        await patch(`/admin/registrations/${ids.bruno}/attendance`, { attended: false });

        const res = await patch(`/admin/courses/${ids.course}/registrations/attendance`, { attended: true });
        expect(res.statusCode, res.body).toBe(200);
        expect(JSON.parse(res.body)).toEqual({ updated: 2 }); // ANA e CARLA

        const regs = await listRegistrations();
        expect(regs.get(ids.ana)?.attended).toBe(true);
        expect(regs.get(ids.carla)?.attended).toBe(true);
        expect(regs.get(ids.bruno)?.attended).toBe(false);
        expect(regs.get(ids.daniel)?.attended).toBeNull(); // pendente fica sem marcar

        const again = await patch(`/admin/courses/${ids.course}/registrations/attendance`, { attended: true });
        expect(JSON.parse(again.body)).toEqual({ updated: 0 });
    });

    it('"Todos presentes" com null → 400 sem marcar faltas', async () => {
        const res = await patch(`/admin/courses/${ids.course}/registrations/attendance`, { attended: null });
        expect(res.statusCode).toBe(400);
        expect((await listRegistrations()).get(ids.daniel)?.attended).toBeNull();
    });

    it('planilha de inscrições traz a coluna Presença', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/admin/export/registrations',
            headers: bearer(token),
            payload: { courseIds: [ids.course] },
        });
        expect(res.statusCode, res.body).toBe(200);
        expect(res.body).toContain('"Presença"');
        expect(res.body).toContain('"Presente"');
        expect(res.body).toContain('"Faltou"');
    });
});

describe('Curso concluído', () => {
    it('conclui curso em andamento; concluir de novo → 409', async () => {
        const res = await patch(`/admin/courses/${ids.course}/complete`);
        expect(res.statusCode, res.body).toBe(200);
        expect(JSON.parse(res.body)).toEqual({ id: ids.course,
status: 'COMPLETED' });

        const again = await patch(`/admin/courses/${ids.course}/complete`);
        expect(again.statusCode).toBe(409);
    });

    it('fora da lista pública, mas a página abre pelo link', async () => {
        const list = await app.inject({ method: 'GET',
url: '/courses?limit=100' });
        const listed = (JSON.parse(list.body) as { data: { id: string }[] }).data.map(c => c.id);
        expect(listed).not.toContain(ids.course);

        const detail = await app.inject({ method: 'GET',
url: `/courses/${ids.course}` });
        expect(detail.statusCode).toBe(200);
        expect(JSON.parse(detail.body).status).toBe('COMPLETED');
    });

    it('recusa inscrição pública', async () => {
        const res = await app.inject({
            method: 'POST',
            url: `/courses/${ids.course}/register`,
            payload: { name: 'VISITANTE PRESENCA',
email: 'visitante.presenca@test.com',
phone: '44933339999',
cpf: '52998224725' },
        });
        expect(res.statusCode, res.body).toBe(409);
        expect(JSON.parse(res.body).error).toBe('Este curso já terminou e não aceita mais inscrições.');
    });

    it('a edição aceita voltar para "em andamento"', async () => {
        const res = await patch(`/courses/${ids.course}`, { status: 'IN_PROGRESS' });
        expect(res.statusCode, res.body).toBe(200);
        const course = await prisma.course.findUnique({ where: { id: ids.course } });
        expect(course?.status).toBe('IN_PROGRESS');
    });
});
