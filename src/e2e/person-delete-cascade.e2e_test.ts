import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { hash } from 'bcrypt';
import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../generated/prisma/client.js';
import { createTestApp } from './helpers/create-test-app.js';
import { createTestPrisma, cleanDatabase, seedSuperAdmin, loginAndGetToken, bearer } from './helpers/db.js';

// Excluir uma pessoa (`UserDataAdapter.delete`) derruba, na mesma transação, tudo
// o que só existe por causa dela: login, convite não usado, inscrições ativas,
// escala como instrutor, Unimed, propriedades, relações, contato público e
// vínculos com empresas. As telas já escondem quem foi excluído, então só a
// tela não prova a cascata: aqui cada item é conferido pelo comportamento
// (login, vaga, convite) e pela linha no banco.

let app: FastifyInstance;
let prisma: PrismaClient;
let superToken: string;
let personToken: string;

const ids: Record<string, string> = {};
const PERSON_LOGIN = 'pessoa.excluida';
const PERSON_PASSWORD = 'cascataPass123!';
// O cleanDatabase não limpa AdminInvite (a tabela não tem FK para UserData) e o
// convite usado sobra de uma rodada para outra: token novo a cada rodada.
const UNUSED_INVITE = `convite-cascata-nao-usado-${randomUUID()}`;
const USED_INVITE = `convite-cascata-usado-${randomUUID()}`;

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

beforeAll(async () => {
    prisma = createTestPrisma();
    await cleanDatabase(prisma);
    await seedSuperAdmin(prisma);
    app = await createTestApp(prisma);
    superToken = await loginAndGetToken(app);

    const person = await prisma.userData.create({
        data: { name: 'PESSOA EXCLUIDA',
phone: '44981110001',
cpf: cpfFrom('111444777') },
    });
    const other = await prisma.userData.create({ data: { name: 'OUTRA PESSOA',
phone: '44981110002' } });
    const third = await prisma.userData.create({ data: { name: 'TERCEIRA PESSOA',
phone: '44981110003' } });
    ids.person = person.id;
    ids.other = other.id;
    ids.third = third.id;

    // Login no painel e convites.
    const rule = await prisma.rule.create({ data: { name: 'CASCATA_RULE',
description: 'E2E',
permissions: ['READ_USER'] } });
    const admin = await prisma.userAdmin.create({
        data: { username: PERSON_LOGIN,
passwordHash: await hash(PERSON_PASSWORD, 4),
userDataId: person.id,
rulesId: rule.id },
    });
    ids.admin = admin.id;
    personToken = await loginAndGetToken(app, PERSON_LOGIN, PERSON_PASSWORD);
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await prisma.adminInvite.create({ data: { token: UNUSED_INVITE,
userDataId: person.id,
rulesId: rule.id,
expiresAt: future } });
    await prisma.adminInvite.create({
        data: { token: USED_INVITE,
userDataId: person.id,
rulesId: rule.id,
expiresAt: future,
usedAt: new Date() },
    });

    // Curso de uma vaga, ocupada pela pessoa. Ela também dá aula nele.
    const room = await prisma.room.create({ data: { name: 'SALA APL',
description: 'x',
maxCapacity: 1 } });
    const course = await prisma.course.create({
        data: {
            name: 'CURSO CASCATA',
            description: 'x',
            roomId: room.id,
            status: 'PUBLIC',
            startTime: new Date('2032-06-10T08:00:00Z'),
            endTime: new Date('2032-06-12T17:00:00Z'),
        },
    });
    ids.course = course.id;
    const registration = await prisma.courseUserRegistration.create({ data: { courseId: course.id,
userDataId: person.id } });
    ids.registration = registration.id;
    const instructor = await prisma.userInstructor.create({ data: { userDataId: person.id } });
    const assignment = await prisma.courseInstructor.create({ data: { instructorId: instructor.id,
courseId: course.id } });
    ids.assignment = assignment.id;

    // Unimed, propriedade e relações nos dois sentidos (mais uma que não é dela).
    const unimed = await prisma.unimedBeneficiario.create({ data: { userDataId: person.id,
plano: 'E2E' } });
    ids.unimed = unimed.id;
    const address = await prisma.address.create({ data: { city: 'TERRA ROXA',
state: 'PR' } });
    const property = await prisma.property.create({ data: { userDataId: person.id,
name: 'SITIO',
addressId: address.id } });
    ids.property = property.id;
    const outgoing = await prisma.userRelation.create({ data: { sourceId: person.id,
targetId: other.id,
label: 'IRMAO' } });
    const incoming = await prisma.userRelation.create({ data: { sourceId: other.id,
targetId: person.id,
label: 'IRMAO' } });
    const unrelated = await prisma.userRelation.create({ data: { sourceId: other.id,
targetId: third.id,
label: 'PRIMO' } });
    ids.outgoing = outgoing.id;
    ids.incoming = incoming.id;
    ids.unrelated = unrelated.id;

    // Contato público e empresa com a pessoa e mais alguém.
    await prisma.publicContact.create({ data: { userDataId: person.id,
title: 'PRESIDENTE' } });
    await prisma.publicContact.create({ data: { userDataId: other.id,
title: 'SECRETARIA' } });
    const company = await prisma.company.create({ data: { name: 'EMPRESA CASCATA' } });
    ids.company = company.id;
    await prisma.companyMember.create({ data: { companyId: company.id,
userDataId: person.id,
title: 'SOCIO' } });
    await prisma.companyMember.create({ data: { companyId: company.id,
userDataId: other.id,
title: 'SOCIO' } });
});

afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
});

const registerOther = () =>
    app.inject({
        method: 'POST',
        url: `/courses/${ids.course}/register-full`,
        payload: { name: 'QUEM ESPERAVA A VAGA',
phone: '44981110009',
cpf: cpfFrom('222555888') },
    });

describe('antes de excluir', () => {
    it('o login funciona, o convite abre e o curso está lotado', async () => {
        const me = await app.inject({ method: 'GET',
url: '/admin/me',
headers: bearer(personToken) });
        expect(me.statusCode, me.body).toBe(200);

        const invite = await app.inject({ method: 'GET',
url: `/invites/${UNUSED_INVITE}` });
        expect(invite.statusCode, invite.body).toBe(200);

        const full = await registerOther();
        expect(full.statusCode, full.body).toBe(409);
    });
});

describe('excluir a pessoa', () => {
    it('DELETE /users/:id → 204', async () => {
        const res = await app.inject({ method: 'DELETE',
url: `/users/${ids.person}`,
headers: bearer(superToken) });
        expect(res.statusCode, res.body).toBe(204);
        const person = await prisma.userData.findUniqueOrThrow({ where: { id: ids.person } });
        expect(person.isDeleted).toBe(true);
    });

    it('login com a senha certa → 401', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/auth/login',
            payload: { username: PERSON_LOGIN,
password: PERSON_PASSWORD },
        });
        expect(res.statusCode, res.body).toBe(401);
        const admin = await prisma.userAdmin.findUniqueOrThrow({ where: { id: ids.admin } });
        expect(admin.isDeleted).toBe(true);
    });

    it('o token que ela já tinha → 401', async () => {
        const me = await app.inject({ method: 'GET',
url: '/admin/me',
headers: bearer(personToken) });
        expect(me.statusCode, me.body).toBe(401);
        const refresh = await app.inject({ method: 'POST',
url: '/auth/refresh',
headers: bearer(personToken) });
        expect(refresh.statusCode, refresh.body).toBe(401);
    });

    it('o convite não usado some; o já usado fica (é histórico)', async () => {
        const res = await app.inject({ method: 'GET',
url: `/invites/${UNUSED_INVITE}` });
        expect(res.statusCode, res.body).toBe(404);
        const left = await prisma.adminInvite.findMany({ where: { userDataId: ids.person },
select: { token: true } });
        expect(left.map(i => i.token)).toEqual([USED_INVITE]);
    });

    it('a inscrição ativa é cancelada e a vaga volta', async () => {
        const reg = await prisma.courseUserRegistration.findUniqueOrThrow({ where: { id: ids.registration } });
        expect(reg.isDeleted).toBe(true);

        const res = await registerOther();
        expect(res.statusCode, res.body).toBe(201);

        const list = await app.inject({
            method: 'GET',
            url: `/admin/courses/${ids.course}/registrations?limit=100`,
            headers: bearer(superToken),
        });
        expect(list.statusCode, list.body).toBe(200);
        const names = (JSON.parse(list.body) as { data: { userData: { name: string } }[] }).data.map(r => r.userData.name);
        expect(names).toEqual(['QUEM ESPERAVA A VAGA']);
    });

    it('sai da escala do curso e da lista de instrutores', async () => {
        const assignment = await prisma.courseInstructor.findUniqueOrThrow({ where: { id: ids.assignment } });
        expect(assignment.isDeleted).toBe(true);

        const course = await app.inject({ method: 'GET',
url: `/courses/${ids.course}` });
        expect(course.statusCode, course.body).toBe(200);
        expect((JSON.parse(course.body) as { instructors: unknown[] }).instructors).toEqual([]);

        const instructors = await app.inject({ method: 'GET',
url: '/admin/instructors',
headers: bearer(superToken) });
        expect(instructors.statusCode, instructors.body).toBe(200);
        expect(instructors.body).not.toContain('PESSOA EXCLUIDA');
    });

    it('o cadastro da Unimed é excluído', async () => {
        const unimed = await prisma.unimedBeneficiario.findUniqueOrThrow({ where: { id: ids.unimed } });
        expect(unimed.isDeleted).toBe(true);
        const res = await app.inject({ method: 'GET',
url: `/admin/unimed/${ids.unimed}`,
headers: bearer(superToken) });
        expect(res.statusCode, res.body).toBe(404);
    });

    it('a propriedade é excluída', async () => {
        const property = await prisma.property.findUniqueOrThrow({ where: { id: ids.property } });
        expect(property.isDeleted).toBe(true);
    });

    it('as relações dela caem nos dois sentidos; a dos outros fica', async () => {
        const rows = await prisma.userRelation.findMany({ select: { id: true,
isDeleted: true } });
        const deleted = Object.fromEntries(rows.map(r => [r.id, r.isDeleted]));
        expect(deleted[ids.outgoing]).toBe(true);
        expect(deleted[ids.incoming]).toBe(true);
        expect(deleted[ids.unrelated]).toBe(false);
    });

    it('sai dos contatos públicos; o outro contato continua', async () => {
        expect(await prisma.publicContact.count({ where: { userDataId: ids.person } })).toBe(0);
        const res = await app.inject({ method: 'GET',
url: '/contacts' });
        expect(res.statusCode, res.body).toBe(200);
        expect(res.body).not.toContain('PESSOA EXCLUIDA');
        expect(res.body).toContain('OUTRA PESSOA');
    });

    it('sai da empresa; a empresa e o outro sócio ficam', async () => {
        const members = await prisma.companyMember.findMany({ where: { companyId: ids.company },
select: { userDataId: true } });
        expect(members.map(m => m.userDataId)).toEqual([ids.other]);
        const company = await prisma.company.findUniqueOrThrow({ where: { id: ids.company } });
        expect(company.isDeleted).toBe(false);
    });

    it('as outras pessoas continuam ativas', async () => {
        const others = await prisma.userData.findMany({ where: { id: { in: [ids.other, ids.third] } } });
        expect(others.map(p => p.isDeleted)).toEqual([false, false]);
    });
});
