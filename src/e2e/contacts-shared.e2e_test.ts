import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '../generated/prisma/client.js';
import { createTestApp } from './helpers/create-test-app.js';
import { createTestPrisma, cleanDatabase, seedSuperAdmin, loginAndGetToken, bearer } from './helpers/db.js';

// E-mail e telefone podem repetir entre pessoas (casal, pais e filhos) e o e-mail
// é opcional. Só o CPF identifica a pessoa (migração 20260920090000).

let app: FastifyInstance;
let prisma: PrismaClient;
let token: string;
let courseId: string;

type Person = {
    id: string;
    name: string;
    email: string | null;
    phone: string;
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
            name: 'CURSO CONTATO COMPARTILHADO',
            description: 'x',
            roomId: room.id,
            status: 'PUBLIC',
            startTime: new Date('2032-05-01T08:00:00Z'),
            endTime: new Date('2032-05-02T17:00:00Z'),
        },
    });
    courseId = course.id;
});

afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
});

async function detail(id: string): Promise<Person> {
    const res = await app.inject({ method: 'GET',
url: `/admin/users/${id}`,
headers: bearer(token) });
    expect(res.statusCode, res.body).toBe(200);
    return JSON.parse(res.body) as Person;
}

describe('POST /users — contato compartilhado', () => {
    it('cria duas pessoas com o mesmo telefone e o mesmo e-mail', async () => {
        const shared = { email: 'familia.silva@test.com',
phone: '44933330001' };
        const a = await app.inject({ method: 'POST',
url: '/users',
payload: { name: 'JOSE SILVA',
cpf: '74012583077',
...shared } });
        const b = await app.inject({ method: 'POST',
url: '/users',
payload: { name: 'ANA SILVA',
cpf: '74012583158',
...shared } });
        expect(a.statusCode, a.body).toBe(201);
        expect(b.statusCode, b.body).toBe(201);

        const [pa, pb] = [JSON.parse(a.body) as Person, JSON.parse(b.body) as Person];
        expect(pa.id).not.toBe(pb.id);
        expect((await detail(pa.id)).email).toBe(shared.email);
        expect((await detail(pb.id)).phone).toBe(shared.phone);
    });

    it('cria pessoa sem e-mail (ausente ou vazio vira null)', async () => {
        const semCampo = await app.inject({ method: 'POST',
url: '/users',
payload: { name: 'PEDRO SEM EMAIL',
phone: '44933330002',
cpf: '74012583239' } });
        expect(semCampo.statusCode, semCampo.body).toBe(201);
        const created = JSON.parse(semCampo.body) as Person;
        expect(created.email).toBeNull();
        expect((await detail(created.id)).email).toBeNull();

        const vazio = await app.inject({ method: 'POST',
url: '/users',
payload: { name: 'LUCIA SEM EMAIL',
email: '',
phone: '44933330003',
cpf: '74012583310' } });
        expect(vazio.statusCode, vazio.body).toBe(201);
        expect((JSON.parse(vazio.body) as Person).email).toBeNull();

        // A lista também serializa o e-mail nulo.
        const list = await app.inject({ method: 'GET',
url: '/admin/users?search=sem%20email',
headers: bearer(token) });
        expect(list.statusCode, list.body).toBe(200);
        const rows = (JSON.parse(list.body) as { data: Person[] }).data;
        expect(rows.length).toBeGreaterThanOrEqual(2);
        expect(rows.every(r => r.email === null)).toBe(true);
    });

    it('apagar o e-mail na edição grava null', async () => {
        const res = await app.inject({ method: 'POST',
url: '/users',
payload: { name: 'CARLOS EDITA',
email: 'carlos@test.com',
phone: '44933330004',
cpf: '74012583409' } });
        const { id } = JSON.parse(res.body) as Person;
        const patch = await app.inject({ method: 'PATCH',
url: `/users/${id}`,
headers: bearer(token),
payload: { email: '' } });
        expect(patch.statusCode, patch.body).toBe(200);
        expect((await detail(id)).email).toBeNull();
    });

    it('CPF repetido continua sendo 409 com mensagem clara', async () => {
        const res = await app.inject({ method: 'POST',
url: '/users',
payload: { name: 'OUTRO JOSE',
phone: '44933330009',
cpf: '740.125.830-77' } });
        expect(res.statusCode).toBe(409);
        expect(JSON.parse(res.body).error).toBe('CPF já cadastrado para outra pessoa.');
    });
});

describe('Inscrição pública sem e-mail', () => {
    it('register-full sem e-mail cria a pessoa e inscreve', async () => {
        const res = await app.inject({
            method: 'POST',
            url: `/courses/${courseId}/register-full`,
            payload: { name: 'MARIA SEM EMAIL',
phone: '44933330010',
cpf: '11144477735' },
        });
        expect(res.statusCode, res.body).toBe(201);
        const { userDataId } = JSON.parse(res.body) as { userDataId: string };
        expect((await detail(userDataId)).email).toBeNull();
    });

    it('register com e-mail vazio e contato de outra pessoa cria cadastro próprio', async () => {
        // Mesmo telefone e e-mail da família Silva, CPF diferente: pessoa nova.
        const res = await app.inject({
            method: 'POST',
            url: `/courses/${courseId}/register`,
            payload: { name: 'JOAO SILVA FILHO',
email: '',
phone: '44933330001',
cpf: '52998224725' },
        });
        expect(res.statusCode, res.body).toBe(201);
        const { userDataId } = JSON.parse(res.body) as { userDataId: string };
        const person = await detail(userDataId);
        expect(person.name).toBe('JOAO SILVA FILHO');
        expect(person.email).toBeNull();

        const again = await app.inject({
            method: 'POST',
            url: `/courses/${courseId}/register-full`,
            payload: { name: 'ANA SILVA',
email: 'familia.silva@test.com',
phone: '44933330001',
cpf: '74012583158' },
        });
        expect(again.statusCode, again.body).toBe(201);
        // CPF já cadastrado: reaproveita a pessoa em vez de criar outra.
        expect(await prisma.userData.count({ where: { cpf: '74012583158' } })).toBe(1);
    });

    it('lista de inscrições devolve e-mail nulo', async () => {
        const res = await app.inject({ method: 'GET',
url: `/admin/courses/${courseId}/registrations?limit=50`,
headers: bearer(token) });
        expect(res.statusCode, res.body).toBe(200);
        const rows = (JSON.parse(res.body) as { data: { userData: Person }[] }).data;
        expect(rows.length).toBe(3);
        expect(rows.filter(r => r.userData.email === null)).toHaveLength(2);
    });
});
