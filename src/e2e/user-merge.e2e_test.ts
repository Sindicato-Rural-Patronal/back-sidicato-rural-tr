import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '../generated/prisma/client.js';
import { createTestApp } from './helpers/create-test-app.js';
import {
    createTestPrisma,
    cleanDatabase,
    seedSuperAdmin,
    loginAndGetToken,
    bearer,
} from './helpers/db.js';

// Juntar dois cadastros da mesma pessoa: o antigo (sem CPF) e o que a inscrição
// pública criou (com CPF). POST /admin/users/merge move tudo e exclui o outro.

let app: FastifyInstance;
let prisma: PrismaClient;
let token: string;
let ruleId: string;
let roomId: string;
let courseAId: string;
let courseBId: string;

async function createPerson(data: {
    name: string;
    phone: string;
    cpf?: string | null;
    email?: string | null;
    rg?: string | null;
}): Promise<string> {
    const person = await prisma.userData.create({
        data: {
            name: data.name,
            phone: data.phone,
            cpf: data.cpf ?? null,
            email: data.email ?? null,
            rg: data.rg ?? null,
        },
    });
    return person.id;
}

async function createProperty(userDataId: string, name: string): Promise<string> {
    const address = await prisma.address.create({
        data: { type: 'RURAL',
city: 'Terra Roxa',
state: 'PR' },
    });
    const property = await prisma.property.create({
        data: { userDataId,
name,
addressId: address.id },
    });
    return property.id;
}

beforeAll(async () => {
    prisma = createTestPrisma();
    await cleanDatabase(prisma);
    const seeded = await seedSuperAdmin(prisma);
    ruleId = seeded.rule.id;
    app = await createTestApp(prisma);
    token = await loginAndGetToken(app);

    const room = await prisma.room.create({
        data: { name: 'SALA 1',
description: 'Sala de aula',
maxCapacity: 30 },
    });
    roomId = room.id;
    const course = await prisma.course.create({
        data: {
            name: 'Manejo de pastagem',
            description: 'curso',
            startTime: new Date('2026-10-05T08:00:00.000Z'),
            endTime: new Date('2026-10-05T12:00:00.000Z'),
            roomId,
        },
    });
    courseAId = course.id;
    const other = await prisma.course.create({
        data: {
            name: 'Ordenha',
            description: 'curso',
            startTime: new Date('2026-11-05T08:00:00.000Z'),
            endTime: new Date('2026-11-05T12:00:00.000Z'),
            roomId,
        },
    });
    courseBId = other.id;
});

afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
});

describe('POST /admin/users/merge', () => {
    it('move inscrições, empresa, propriedade e relação, preenche o que faltava e exclui o repetido', async () => {
        // Cadastro antigo (fica): tem RG, empresa, propriedade e relação; sem CPF.
        const keepId = await createPerson({
            name: 'MARIA DE SOUZA',
            phone: '44991110000',
            rg: '1234567',
        });
        // Cadastro criado pela inscrição pública (sai): tem CPF, e-mail e inscrições.
        const removeId = await createPerson({
            name: 'MARIA DE SOUZA',
            phone: '44991110000',
            cpf: '52998224725',
            email: 'maria@exemplo.com',
        });

        const company = await prisma.company.create({
            data: { name: 'FAZENDA BOA VISTA LTDA',
type: 'PRIVATE',
phone: '44930000000' },
        });
        await prisma.companyMember.create({
            data: { companyId: company.id,
userDataId: removeId,
title: 'SOCIO' },
        });
        const propertyId = await createProperty(removeId, 'SÍTIO SANTA RITA');
        const filhoId = await createPerson({ name: 'JOSE DE SOUZA',
phone: '44991112222' });
        await prisma.userRelation.create({
            data: { sourceId: removeId,
targetId: filhoId,
label: 'FILHO' },
        });

        // Inscrição só do removido (vai junto) e inscrição nos dois no mesmo
        // curso (uma delas é cancelada).
        await prisma.courseUserRegistration.create({
            data: { courseId: courseAId,
userDataId: removeId },
        });
        await prisma.courseUserRegistration.create({
            data: { courseId: courseBId,
userDataId: removeId },
        });
        await prisma.courseUserRegistration.create({
            data: { courseId: courseBId,
userDataId: keepId,
confirmed: true },
        });

        const res = await app.inject({
            method: 'POST',
            url: '/admin/users/merge',
            headers: bearer(token),
            payload: { keepId,
removeId },
        });

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body) as {
            keepId: string;
            removedId: string;
            movedRegistrations: number;
            movedCompanies: number;
            movedProperties: number;
            movedRelations: number;
            filledFields: string[];
        };
        expect(body).toMatchObject({
            keepId,
            removedId: removeId,
            movedRegistrations: 1,
            movedCompanies: 1,
            movedProperties: 1,
            movedRelations: 1,
        });
        expect(body.filledFields).toContain('CPF');
        expect(body.filledFields).toContain('E-mail');

        // O cadastro que fica ganhou o CPF e o e-mail, mas manteve o RG dele.
        const keep = await prisma.userData.findUnique({ where: { id: keepId } });
        expect(keep?.cpf).toBe('52998224725');
        expect(keep?.email).toBe('maria@exemplo.com');
        expect(keep?.rg).toBe('1234567');
        expect(keep?.isDeleted).toBe(false);

        // O repetido some do cadastro, mas continua no banco.
        const removed = await prisma.userData.findUnique({ where: { id: removeId } });
        expect(removed?.isDeleted).toBe(true);
        expect(removed?.deletedAt).not.toBeNull();

        // Inscrições: a do curso A foi movida; no curso B ficou a que já existia.
        const regA = await prisma.courseUserRegistration.findFirst({
            where: { courseId: courseAId,
isDeleted: false },
        });
        expect(regA?.userDataId).toBe(keepId);
        const regsB = await prisma.courseUserRegistration.findMany({
            where: { courseId: courseBId,
isDeleted: false },
        });
        expect(regsB).toHaveLength(1);
        expect(regsB[0].userDataId).toBe(keepId);
        expect(regsB[0].confirmed).toBe(true);

        // Empresa, propriedade e relação passaram para quem ficou.
        const member = await prisma.companyMember.findFirst({ where: { companyId: company.id } });
        expect(member?.userDataId).toBe(keepId);
        expect(member?.title).toBe('SOCIO');
        const property = await prisma.property.findUnique({ where: { id: propertyId } });
        expect(property?.userDataId).toBe(keepId);
        const relation = await prisma.userRelation.findFirst({
            where: { targetId: filhoId,
isDeleted: false },
        });
        expect(relation?.sourceId).toBe(keepId);
    });

    it('lista o par em GET /admin/users/duplicates antes de juntar', async () => {
        await createPerson({ name: 'PEDRO ALVES',
phone: '44992220000' });
        await createPerson({ name: 'PEDRO ALVES',
phone: '44992220000',
cpf: '11144477735' });

        const res = await app.inject({
            method: 'GET',
            url: '/admin/users/duplicates?limit=50',
            headers: bearer(token),
        });

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body) as {
groups: {
 reason: string;
people: {
 id: string;
name: string 
}[] 
}[];
};
        const group = body.groups.find(g => g.people.every(p => p.name === 'PEDRO ALVES'));
        expect(group).toBeDefined();
        expect(group?.people).toHaveLength(2);
    });

    it('recusa com 409 quando os dois cadastros têm CPF diferente', async () => {
        const keepId = await createPerson({
            name: 'CARLOS LIMA',
            phone: '44993330000',
            cpf: '39053344705',
        });
        const removeId = await createPerson({
            name: 'CARLOS LIMA',
            phone: '44993330000',
            cpf: '19119119100',
        });

        const res = await app.inject({
            method: 'POST',
            url: '/admin/users/merge',
            headers: bearer(token),
            payload: { keepId,
removeId },
        });

        expect(res.statusCode).toBe(409);
        expect((JSON.parse(res.body) as { error: string }).error).toBe(
            'Cadastros com CPFs diferentes não podem ser juntados.',
        );
        // Nada mudou: os dois continuam ativos.
        const removed = await prisma.userData.findUnique({ where: { id: removeId } });
        expect(removed?.isDeleted).toBe(false);
    });

    it('recusa com 409 quando os dois cadastros têm acesso ao painel', async () => {
        const keepId = await createPerson({ name: 'ANA GESTORA',
phone: '44994440000' });
        const removeId = await createPerson({ name: 'ANA GESTORA',
phone: '44994440000' });
        await prisma.userAdmin.create({
            data: { username: 'ana1',
passwordHash: 'x',
userDataId: keepId,
rulesId: ruleId },
        });
        await prisma.userAdmin.create({
            data: { username: 'ana2',
passwordHash: 'x',
userDataId: removeId,
rulesId: ruleId },
        });

        const res = await app.inject({
            method: 'POST',
            url: '/admin/users/merge',
            headers: bearer(token),
            payload: { keepId,
removeId },
        });

        expect(res.statusCode).toBe(409);
        expect((JSON.parse(res.body) as { error: string }).error).toContain(
            'conta de acesso ao painel',
        );
        const removed = await prisma.userData.findUnique({ where: { id: removeId } });
        expect(removed?.isDeleted).toBe(false);
    });

    it('recusa juntar o cadastro com ele mesmo', async () => {
        const id = await createPerson({ name: 'SOZINHO',
phone: '44995550000' });
        const res = await app.inject({
            method: 'POST',
            url: '/admin/users/merge',
            headers: bearer(token),
            payload: { keepId: id,
removeId: id },
        });
        expect(res.statusCode).toBe(400);
    });

    it('exige autenticação', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/admin/users/merge',
            payload: { keepId: 'a',
removeId: 'b' },
        });
        expect(res.statusCode).toBe(401);
    });
});
