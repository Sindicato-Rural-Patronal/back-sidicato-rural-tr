import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { hash } from 'bcrypt';
import type { PrismaClient } from '../generated/prisma/client.js';
import { createTestApp } from './helpers/create-test-app.js';
import { createTestPrisma, cleanDatabase, seedSuperAdmin, loginAndGetToken, bearer } from './helpers/db.js';

// Inscrição pelo CPF de quem já tem cadastro, a consulta de CPF do formulário
// público e o que a equipe faz depois: confirmar e cancelar. Até aqui só o
// limite por IP dessas rotas tinha E2E (closed-routes).

let app: FastifyInstance;
let prisma: PrismaClient;
let token: string;
let readOnlyToken: string;
let seq = 0;

type RegistrationItem = {
    id: string;
    confirmed: boolean;
    userData: { name: string };
};

/** CPF válido (dígitos verificadores certos) a partir de 9 dígitos. */
function cpfFrom(base: string): string {
    const digits = base.split('').map(Number);
    for (const factor of [10, 11]) {
        const sum = digits.reduce((acc, d, i) => acc + d * (factor - i), 0);
        const rem = (sum * 10) % 11;
        digits.push(rem >= 10 ? 0 : rem);
    }
    return digits.join('');
}
const nextCpf = () => cpfFrom(String(400000000 + ++seq * 6113).slice(0, 9));
const masked = (cpf: string) => `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;

async function courseWithSeats(seats: number, status: 'PUBLIC' | 'UNPUBLISHED' = 'PUBLIC') {
    seq += 1;
    const room = await prisma.room.create({ data: { name: `SALA INSCRICAO ${seq}`,
description: 'x',
maxCapacity: seats } });
    const course = await prisma.course.create({
        data: {
            name: `CURSO INSCRICAO ${seq}`,
            description: 'x',
            roomId: room.id,
            status,
            startTime: new Date('2032-08-10T08:00:00Z'),
            endTime: new Date('2032-08-12T17:00:00Z'),
        },
    });
    return course.id;
}

async function person(name: string, cpf: string | null = nextCpf()) {
    const p = await prisma.userData.create({ data: { name,
phone: '44991230000',
cpf } });
    return { id: p.id,
cpf: cpf ?? '' };
}

const byCpf = (courseId: string, cpf: string) =>
    app.inject({ method: 'POST',
url: `/courses/${courseId}/register-by-cpf`,
payload: { cpf } });

async function listRegistrations(courseId: string): Promise<RegistrationItem[]> {
    const res = await app.inject({
        method: 'GET',
        url: `/admin/courses/${courseId}/registrations?limit=100`,
        headers: bearer(token),
    });
    expect(res.statusCode, res.body).toBe(200);
    return (JSON.parse(res.body) as { data: RegistrationItem[] }).data;
}

beforeAll(async () => {
    prisma = createTestPrisma();
    await cleanDatabase(prisma);
    await seedSuperAdmin(prisma);
    app = await createTestApp(prisma);
    token = await loginAndGetToken(app);

    // Vê as inscrições, mas não pode mexer nelas.
    const rule = await prisma.rule.create({ data: { name: 'SO_VE_CURSOS',
description: 'E2E',
permissions: ['READ_COURSE'] } });
    const viewer = await prisma.userData.create({ data: { name: 'SO VE',
phone: '44991230001' } });
    await prisma.userAdmin.create({
        data: { username: 'soveinscricoes',
passwordHash: await hash('soVePass123!', 4),
userDataId: viewer.id,
rulesId: rule.id },
    });
    readOnlyToken = await loginAndGetToken(app, 'soveinscricoes', 'soVePass123!');
});

afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
});

describe('GET /users/lookup-cpf/:cpf', () => {
    const lookup = async (cpf: string) => {
        const res = await app.inject({ method: 'GET',
url: `/users/lookup-cpf/${cpf}` });
        expect(res.statusCode, res.body).toBe(200);
        return JSON.parse(res.body) as {
 found: boolean;
name: string | null 
};
    };

    it('cadastro achado: devolve só o primeiro nome e as iniciais', async () => {
        const p = await person('MARIA APARECIDA SOUZA');
        expect(await lookup(p.cpf)).toEqual({ found: true,
name: 'MARIA A. S.' });
    });

    it('acha com o CPF digitado com máscara e o cadastro antigo gravado com máscara', async () => {
        const cpf = nextCpf();
        await person('JOAO LEGADO', masked(cpf));
        expect(await lookup(masked(cpf))).toEqual({ found: true,
name: 'JOAO L.' });
        expect(await lookup(cpf)).toEqual({ found: true,
name: 'JOAO L.' });
    });

    it('CPF válido sem cadastro e CPF inválido: não achado, sem nome', async () => {
        expect(await lookup(nextCpf())).toEqual({ found: false,
name: null });
        expect(await lookup('12345678900')).toEqual({ found: false,
name: null });
    });

    it('pessoa excluída não é achada', async () => {
        const p = await person('PESSOA EXCLUIDA LOOKUP');
        await prisma.userData.update({ where: { id: p.id },
data: { isDeleted: true,
deletedAt: new Date() } });
        expect(await lookup(p.cpf)).toEqual({ found: false,
name: null });
    });
});

describe('POST /courses/:id/register-by-cpf', () => {
    it('quem já tem cadastro se inscreve só com o CPF (com máscara), sem confirmar, e o sino avisa', async () => {
        const courseId = await courseWithSeats(10);
        const p = await person('ANA INSCRITA');
        const res = await byCpf(courseId, masked(p.cpf));
        expect(res.statusCode, res.body).toBe(201);
        const body = JSON.parse(res.body) as {
 registrationId: string;
userDataId: string 
};
        expect(body.userDataId).toBe(p.id);

        const regs = await listRegistrations(courseId);
        expect(regs).toEqual([expect.objectContaining({ id: body.registrationId,
confirmed: false,
userData: expect.objectContaining({ name: 'ANA INSCRITA' }) })]);
        const event = await prisma.notification.findFirst({ where: { type: 'COURSE_REGISTRATION',
entityId: body.registrationId } });
        expect(event?.body).toBe('ANA INSCRITA');
    });

    it('CPF sem cadastro → 404 e nada é criado', async () => {
        const courseId = await courseWithSeats(10);
        const res = await byCpf(courseId, nextCpf());
        expect(res.statusCode, res.body).toBe(404);
        expect(await listRegistrations(courseId)).toEqual([]);
    });

    it('já inscrita → 409', async () => {
        const courseId = await courseWithSeats(10);
        const p = await person('BIA REPETIDA');
        expect((await byCpf(courseId, p.cpf)).statusCode).toBe(201);
        const res = await byCpf(courseId, p.cpf);
        expect(res.statusCode, res.body).toBe(409);
        expect(await listRegistrations(courseId)).toHaveLength(1);
    });

    it('curso lotado → 409; curso não publicado → 409', async () => {
        const full = await courseWithSeats(1);
        expect((await byCpf(full, (await person('PRIMEIRA')).cpf)).statusCode).toBe(201);
        const late = await byCpf(full, (await person('SEGUNDA')).cpf);
        expect(late.statusCode, late.body).toBe(409);

        const hidden = await courseWithSeats(10, 'UNPUBLISHED');
        const res = await byCpf(hidden, (await person('TERCEIRA')).cpf);
        expect(res.statusCode, res.body).toBe(409);
        expect(await listRegistrations(hidden)).toEqual([]);
    });
});

describe('PATCH /admin/registrations/:id/confirm', () => {
    it('confirma e desfaz', async () => {
        const courseId = await courseWithSeats(10);
        const { registrationId } = JSON.parse((await byCpf(courseId, (await person('CARLA CONFIRMA')).cpf)).body) as { registrationId: string };
        const url = `/admin/registrations/${registrationId}/confirm`;

        let res = await app.inject({ method: 'PATCH',
url,
headers: bearer(token),
payload: { confirmed: true } });
        expect(res.statusCode, res.body).toBe(200);
        expect((await listRegistrations(courseId))[0].confirmed).toBe(true);

        res = await app.inject({ method: 'PATCH',
url,
headers: bearer(token),
payload: { confirmed: false } });
        expect(res.statusCode, res.body).toBe(200);
        expect((await listRegistrations(courseId))[0].confirmed).toBe(false);
    });

    it('sem `confirmed` → 400; inscrição inexistente → 404; só com READ_COURSE → 403', async () => {
        const courseId = await courseWithSeats(10);
        const { registrationId } = JSON.parse((await byCpf(courseId, (await person('DORA')).cpf)).body) as { registrationId: string };
        const url = `/admin/registrations/${registrationId}/confirm`;

        expect((await app.inject({ method: 'PATCH',
url,
headers: bearer(token),
payload: {} })).statusCode).toBe(400);
        const missing = await app.inject({
            method: 'PATCH',
            url: '/admin/registrations/00000000-0000-0000-0000-000000000000/confirm',
            headers: bearer(token),
            payload: { confirmed: true },
        });
        expect(missing.statusCode, missing.body).toBe(404);
        const forbidden = await app.inject({ method: 'PATCH',
url,
headers: bearer(readOnlyToken),
payload: { confirmed: true } });
        expect(forbidden.statusCode, forbidden.body).toBe(403);
        expect((await listRegistrations(courseId))[0].confirmed).toBe(false);
    });
});

describe('DELETE /admin/registrations/:id', () => {
    it('cancela: some da lista, libera a vaga e a pessoa pode se inscrever de novo', async () => {
        const courseId = await courseWithSeats(1);
        const first = await person('EDU CANCELA');
        const { registrationId } = JSON.parse((await byCpf(courseId, first.cpf)).body) as { registrationId: string };
        const waiting = await person('FABIO ESPERA');
        expect((await byCpf(courseId, waiting.cpf)).statusCode).toBe(409);

        const res = await app.inject({ method: 'DELETE',
url: `/admin/registrations/${registrationId}`,
headers: bearer(token) });
        expect(res.statusCode, res.body).toBe(204);
        expect(await listRegistrations(courseId)).toEqual([]);
        const row = await prisma.courseUserRegistration.findUniqueOrThrow({ where: { id: registrationId } });
        expect(row.isDeleted).toBe(true);

        const took = await byCpf(courseId, waiting.cpf);
        expect(took.statusCode, took.body).toBe(201);

        // Cancela a de quem pegou a vaga e a primeira pessoa volta: o índice
        // único da inscrição só conta as ativas.
        const { registrationId: second } = JSON.parse(took.body) as { registrationId: string };
        await app.inject({ method: 'DELETE',
url: `/admin/registrations/${second}`,
headers: bearer(token) });
        const back = await byCpf(courseId, first.cpf);
        expect(back.statusCode, back.body).toBe(201);
        expect((await listRegistrations(courseId)).map(r => r.userData.name)).toEqual(['EDU CANCELA']);
    });

    it('cancelar de novo → 404; confirmar inscrição cancelada → 404', async () => {
        const courseId = await courseWithSeats(10);
        const { registrationId } = JSON.parse((await byCpf(courseId, (await person('GIL')).cpf)).body) as { registrationId: string };
        const url = `/admin/registrations/${registrationId}`;
        expect((await app.inject({ method: 'DELETE',
url,
headers: bearer(token) })).statusCode).toBe(204);

        const again = await app.inject({ method: 'DELETE',
url,
headers: bearer(token) });
        expect(again.statusCode, again.body).toBe(404);
        const confirm = await app.inject({ method: 'PATCH',
url: `${url}/confirm`,
headers: bearer(token),
payload: { confirmed: true } });
        expect(confirm.statusCode, confirm.body).toBe(404);
    });

    it('só com READ_COURSE → 403 e a inscrição continua', async () => {
        const courseId = await courseWithSeats(10);
        const { registrationId } = JSON.parse((await byCpf(courseId, (await person('HELO')).cpf)).body) as { registrationId: string };
        const res = await app.inject({ method: 'DELETE',
url: `/admin/registrations/${registrationId}`,
headers: bearer(readOnlyToken) });
        expect(res.statusCode, res.body).toBe(403);
        expect(await listRegistrations(courseId)).toHaveLength(1);
    });
});
