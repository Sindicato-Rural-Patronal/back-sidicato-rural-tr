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

/** Telefone padrão das pessoas de teste: final 0000. */
const PHONE = '44991230000';

type Phones = {
 phone?: string;
phone2?: string | null;
phone3?: string | null 
};

async function person(name: string, cpf: string | null = nextCpf(), phones: Phones = {}) {
    const p = await prisma.userData.create({ data: { name,
phone: PHONE,
...phones,
cpf } });
    return { id: p.id,
cpf: cpf ?? '' };
}

const byCpf = (courseId: string, cpf: string, phoneEnd = '0000') =>
    app.inject({ method: 'POST',
url: `/courses/${courseId}/register-by-cpf`,
payload: { cpf,
phoneEnd } });

const full = (courseId: string, payload: Record<string, unknown>) =>
    app.inject({ method: 'POST',
url: `/courses/${courseId}/register-full`,
payload });

const lookupRaw = (cpf: string, phoneEnd: string) =>
    app.inject({ method: 'POST',
url: '/users/lookup-cpf',
payload: { cpf,
phoneEnd } });

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

describe('POST /users/lookup-cpf', () => {
    const lookup = async (cpf: string, phoneEnd = '0000') => {
        const res = await lookupRaw(cpf, phoneEnd);
        expect(res.statusCode, res.body).toBe(200);
        return JSON.parse(res.body) as {
 found: boolean;
name: string | null
};
    };
    const NOT_FOUND = { found: false,
name: null };

    it('CPF e final do telefone certos: devolve só o primeiro nome e as iniciais', async () => {
        const p = await person('MARIA APARECIDA SOUZA');
        expect(await lookup(p.cpf)).toEqual({ found: true,
name: 'MARIA A. S.' });
    });

    it('acha com o CPF digitado com máscara e o cadastro antigo gravado com máscara', async () => {
        const cpf = nextCpf();
        await person('JOAO LEGADO', masked(cpf), { phone: '(44) 3624-5678' });
        expect(await lookup(masked(cpf), '5678')).toEqual({ found: true,
name: 'JOAO L.' });
        expect(await lookup(cpf, '5678')).toEqual({ found: true,
name: 'JOAO L.' });
    });

    it('confere com o segundo e o terceiro telefone, com DDI e máscara', async () => {
        const p = await person('TRES FONES', nextCpf(), { phone2: '+55 44 98888-1111',
phone3: '5544977772222' });
        expect((await lookup(p.cpf, '1111')).found).toBe(true);
        expect((await lookup(p.cpf, '2222')).found).toBe(true);
    });

    it('telefone que não confere e CPF sem cadastro: a mesma resposta, letra por letra', async () => {
        const p = await person('MARIA ERRADA');
        const wrong = await lookupRaw(p.cpf, '9999');
        const missing = await lookupRaw(nextCpf(), '0000');
        expect(wrong.statusCode).toBe(200);
        expect(missing.statusCode).toBe(200);
        expect(wrong.body).toBe(missing.body);
        expect(JSON.parse(wrong.body)).toEqual(NOT_FOUND);
    });

    it('CPF inválido e pessoa excluída: não achado', async () => {
        expect(await lookup('12345678900')).toEqual(NOT_FOUND);
        const p = await person('PESSOA EXCLUIDA LOOKUP');
        await prisma.userData.update({ where: { id: p.id },
data: { isDeleted: true,
deletedAt: new Date() } });
        expect(await lookup(p.cpf)).toEqual(NOT_FOUND);
    });

    it('final sem 4 dígitos ou faltando → 400', async () => {
        const p = await person('SEM FINAL');
        expect((await lookupRaw(p.cpf, '12')).statusCode).toBe(400);
        const res = await app.inject({ method: 'POST',
url: '/users/lookup-cpf',
payload: { cpf: p.cpf } });
        expect(res.statusCode).toBe(400);
    });

    it('a consulta antiga, com o CPF na URL, não existe mais', async () => {
        const p = await person('URL ANTIGA');
        const res = await app.inject({ method: 'GET',
url: `/users/lookup-cpf/${p.cpf}` });
        expect(res.statusCode).toBe(404);
    });

    it('não vai para a auditoria', async () => {
        const p = await person('SEM AUDITORIA');
        await lookup(p.cpf);
        expect(await prisma.auditLog.count({ where: { path: { contains: 'lookup-cpf' } } })).toBe(0);
    });
});

describe('Limite de erros por CPF', () => {
    const found = async (cpf: string) => (JSON.parse((await lookupRaw(cpf, '0000')).body) as { found: boolean }).found;

    it('5 erros na hora → 429, até com o par certo, com ou sem cadastro, somando consulta e inscrições', async () => {
        const courseId = await courseWithSeats(10);
        const p = await person('ALVO DE TENTATIVAS');
        const unknown = nextCpf();
        for (const cpf of [p.cpf, unknown]) {
            for (let i = 0; i < 3; i++) expect((await lookupRaw(cpf, `999${i}`)).statusCode).toBe(200);
            expect((await byCpf(courseId, cpf, '9993')).statusCode).toBe(404);
            expect((await byCpf(courseId, cpf, '9994')).statusCode).toBe(404);
        }
        for (const cpf of [p.cpf, unknown]) {
            const blocked = await lookupRaw(cpf, '0000');
            expect(blocked.statusCode, blocked.body).toBe(429);
            expect(JSON.parse(blocked.body).error).toBe('Muitas tentativas com este CPF. Aguarde uma hora ou procure o Sindicato.');
            expect((await byCpf(courseId, cpf, '0000')).statusCode).toBe(429);
        }
        const res = await full(courseId, { name: 'ALVO',
phone: PHONE,
cpf: p.cpf });
        expect(res.statusCode, res.body).toBe(429);
        expect(await listRegistrations(courseId)).toEqual([]);

        // Outro CPF segue normal.
        expect(await found((await person('OUTRA PESSOA')).cpf)).toBe(true);
    });

    it('o register-full com telefone errado também conta', async () => {
        const courseId = await courseWithSeats(10);
        const p = await person('ALVO DO FULL');
        for (let i = 0; i < 5; i++) {
            expect((await full(courseId, { name: 'X',
phone: `4498888000${i}`,
cpf: p.cpf })).statusCode).toBe(409);
        }
        expect((await lookupRaw(p.cpf, '0000')).statusCode).toBe(429);
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

    it('CPF sem cadastro e telefone que não confere: o mesmo 404, e nada é criado', async () => {
        const courseId = await courseWithSeats(10);
        const missing = await byCpf(courseId, nextCpf());
        const wrong = await byCpf(courseId, (await person('TELEFONE ERRADO')).cpf, '9999');
        expect(missing.statusCode, missing.body).toBe(404);
        expect(wrong.statusCode, wrong.body).toBe(404);
        expect(wrong.body).toBe(missing.body);
        expect(JSON.parse(wrong.body).error).toBe('Não encontramos cadastro com este CPF e telefone.');
        expect(await listRegistrations(courseId)).toEqual([]);
    });

    it('final do telefone faltando ou sem 4 dígitos → 400', async () => {
        const courseId = await courseWithSeats(10);
        const p = await person('SEM FINAL BY CPF');
        expect((await byCpf(courseId, p.cpf, '1')).statusCode).toBe(400);
        const res = await app.inject({ method: 'POST',
url: `/courses/${courseId}/register-by-cpf`,
payload: { cpf: p.cpf } });
        expect(res.statusCode).toBe(400);
        expect(await listRegistrations(courseId)).toEqual([]);
    });

    it('já inscrita → 409', async () => {
        const courseId = await courseWithSeats(10);
        const p = await person('BIA REPETIDA');
        expect((await byCpf(courseId, p.cpf)).statusCode).toBe(201);
        const res = await byCpf(courseId, p.cpf);
        expect(res.statusCode, res.body).toBe(409);
        expect(JSON.parse(res.body).error).toBe('Esta pessoa já está inscrita neste curso.');
        expect(await listRegistrations(courseId)).toHaveLength(1);

        // Mesma resposta no register-full, para quem já tem inscrição.
        const full2 = await full(courseId, { name: 'X',
phone: PHONE,
cpf: p.cpf });
        expect(full2.statusCode, full2.body).toBe(409);
        expect(JSON.parse(full2.body).error).toBe('Esta pessoa já está inscrita neste curso.');
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

describe('POST /courses/:id/register-full com CPF que já tem cadastro', () => {
    it('telefone confere (com máscara, DDI ou sem DDD): inscreve a pessoa existente sem mexer no cadastro', async () => {
        const p = await person('DONA DO CADASTRO', nextCpf(), { phone: '(44) 99123-4567' });
        for (const [i, phone] of ['44991234567', '+55 (44) 99123-4567', '99123-4567'].entries()) {
            const courseId = await courseWithSeats(10);
            const res = await full(courseId, { name: `OUTRO NOME ${i}`,
phone,
email: 'novo@test.com',
cpf: p.cpf,
rg: '123',
address: { city: 'CIDADE NOVA' } });
            expect(res.statusCode, res.body).toBe(201);
            expect(JSON.parse(res.body).userDataId).toBe(p.id);
        }
        const row = await prisma.userData.findUniqueOrThrow({ where: { id: p.id } });
        expect(row).toMatchObject({ name: 'DONA DO CADASTRO',
phone: '(44) 99123-4567',
email: null,
rg: null,
primaryPropertyId: null });
        expect(await prisma.userData.count({ where: { cpf: p.cpf } })).toBe(1);
    });

    it('cadastro antigo com 8 dígitos confere com o celular de 9 dígitos', async () => {
        const p = await person('CELULAR ANTIGO', nextCpf(), { phone: '9123-4567' });
        const res = await full(await courseWithSeats(10), { name: 'X',
phone: '44991234567',
cpf: p.cpf });
        expect(res.statusCode, res.body).toBe(201);
    });

    it('telefone que não confere ou cadastro sem telefone: 409 genérico, nada vinculado nem alterado', async () => {
        const courseId = await courseWithSeats(10);
        const other = await person('TELEFONE DIFERENTE');
        const noPhone = await person('SEM TELEFONE', nextCpf(), { phone: '' });
        for (const p of [other, noPhone]) {
            const res = await full(courseId, { name: 'INVASOR',
phone: '44988887777',
email: 'invasor@test.com',
cpf: p.cpf,
address: { city: 'X' } });
            expect(res.statusCode, res.body).toBe(409);
            expect(JSON.parse(res.body).error).toBe('Não foi possível confirmar seu cadastro pelo site. Procure o Sindicato para fazer a inscrição.');
            const row = await prisma.userData.findUniqueOrThrow({ where: { id: p.id } });
            expect(row.name).not.toBe('INVASOR');
            expect(row.email).toBeNull();
            expect(row.primaryPropertyId).toBeNull();
            expect(await prisma.userData.count({ where: { cpf: p.cpf } })).toBe(1);
        }
        expect(await listRegistrations(courseId)).toEqual([]);
        expect(await prisma.notification.count({ where: { type: 'COURSE_REGISTRATION',
body: 'INVASOR' } })).toBe(0);
    });

    it('CPF sem cadastro continua criando a pessoa', async () => {
        const cpf = nextCpf();
        const res = await full(await courseWithSeats(10), { name: 'PESSOA NOVA FULL',
phone: '44977776666',
cpf });
        expect(res.statusCode, res.body).toBe(201);
        expect(await prisma.userData.count({ where: { cpf } })).toBe(1);
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
