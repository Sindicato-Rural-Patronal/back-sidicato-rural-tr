import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '../generated/prisma/client.js';
import { createTestApp } from './helpers/create-test-app.js';
import { createTestPrisma, cleanDatabase, seedSuperAdmin, loginAndGetToken, bearer } from './helpers/db.js';

// Site público configurável: contatos públicos, dados do sindicato, cotações
// (histórico e fonte) e selos da lista de inscritos.

let app: FastifyInstance;
let prisma: PrismaClient;
let token: string;

beforeAll(async () => {
    prisma = createTestPrisma();
    await cleanDatabase(prisma);
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "MarketQuoteHistory"');
    await prisma.$executeRawUnsafe('DELETE FROM "SiteSetting"');
    await seedSuperAdmin(prisma);
    app = await createTestApp(prisma);
    token = await loginAndGetToken(app);
});

afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
});

async function createPerson(name: string, email: string, phone: string) {
    return prisma.userData.create({ data: { name,
email,
phone } });
}

describe('Contatos públicos', () => {
    it('qualquer pessoa do cadastro vira contato, com cargo e ordem', async () => {
        const secretaria = await createPerson('ANA SECRETARIA', 'ana@test.com', '44911112001');
        const presidente = await createPerson('ZECA PRESIDENTE', 'zeca@test.com', '44911112002');

        const a = await app.inject({ method: 'POST',
url: '/admin/public-contacts',
headers: bearer(token),
payload: { userDataId: secretaria.id,
title: 'Secretária' } });
        expect(a.statusCode, a.body).toBe(201);
        const b = await app.inject({ method: 'POST',
url: '/admin/public-contacts',
headers: bearer(token),
payload: { userDataId: presidente.id,
title: 'Presidente' } });
        expect(b.statusCode).toBe(201);

        const dup = await app.inject({ method: 'POST',
url: '/admin/public-contacts',
headers: bearer(token),
payload: { userDataId: presidente.id } });
        expect(dup.statusCode).toBe(409);

        const ids = [JSON.parse(b.body).id, JSON.parse(a.body).id];
        const reorder = await app.inject({ method: 'PATCH',
url: '/admin/public-contacts/reorder',
headers: bearer(token),
payload: { order: ids } });
        expect(reorder.statusCode).toBe(200);

        const pub = await app.inject({ method: 'GET',
url: '/contacts' });
        expect(pub.statusCode).toBe(200);
        const list = JSON.parse(pub.body) as {
 publicTitle: string | null;
userData: {
 name: string;
email: string 
} 
}[];
        expect(list.map(c => [c.userData.name, c.publicTitle])).toEqual([
            ['ZECA PRESIDENTE', 'Presidente'],
            ['ANA SECRETARIA', 'Secretária'],
        ]);

        const edit = await app.inject({ method: 'PATCH',
url: `/admin/public-contacts/${ids[1]}`,
headers: bearer(token),
payload: { title: '' } });
        expect(edit.statusCode).toBe(200);
        expect(JSON.parse(edit.body).title).toBeNull();

        const del = await app.inject({ method: 'DELETE',
url: `/admin/public-contacts/${ids[0]}`,
headers: bearer(token) });
        expect(del.statusCode).toBe(204);
        const after = JSON.parse((await app.inject({ method: 'GET',
url: '/contacts' })).body) as unknown[];
        expect(after).toHaveLength(1);
    });

    it('admin sem token não mexe nos contatos', async () => {
        const res = await app.inject({ method: 'POST',
url: '/admin/public-contacts',
payload: { userDataId: 'x' } });
        expect(res.statusCode).toBe(401);
    });
});

describe('Configurações do site', () => {
    it('grava dados do sindicato e texto do Sobre; o público lê tudo', async () => {
        const patch = await app.inject({
            method: 'PATCH',
            url: '/admin/site-settings',
            headers: bearer(token),
            payload: { orgPhone: '(44) 3645-1200',
orgCity: 'Terra Roxa',
orgState: 'pr',
aboutText: 'Fundado em 1986.' },
        });
        expect(patch.statusCode, patch.body).toBe(200);
        const pub = JSON.parse((await app.inject({ method: 'GET',
url: '/site-settings' })).body) as Record<string, string>;
        expect(pub.orgPhone).toBe('(44) 3645-1200');
        expect(pub.orgState).toBe('PR');
        expect(pub.aboutText).toBe('Fundado em 1986.');
        expect(pub.instagram).toBe('');
    });

    it('UF inválida é 400', async () => {
        const res = await app.inject({ method: 'PATCH',
url: '/admin/site-settings',
headers: bearer(token),
payload: { orgState: 'Paraná' } });
        expect(res.statusCode).toBe(400);
    });
});

describe('Cotações: fonte e histórico', () => {
    it('fonte editável pelo endpoint das cotações', async () => {
        const res = await app.inject({ method: 'PUT',
url: '/admin/market-quotes/source',
headers: bearer(token),
payload: { source: 'Coamo' } });
        expect(res.statusCode).toBe(200);
        const pub = JSON.parse((await app.inject({ method: 'GET',
url: '/site-settings' })).body) as Record<string, string>;
        expect(pub.quotesSource).toBe('Coamo');
    });

    it('unidade do produto é configurável e refaz o texto do preço', async () => {
        const admin = JSON.parse((await app.inject({ method: 'GET',
url: '/admin/market-quotes',
headers: bearer(token) })).body) as {
 id: string;
label: string 
}[];
        const mandioca = admin.find(q => q.label === 'MANDIOCA')!;
        await app.inject({ method: 'PUT',
url: '/admin/market-quotes/daily',
headers: bearer(token),
payload: { period: 'MORNING',
prices: [{ id: mandioca.id,
priceCents: 76000 }] } });

        const kg = await app.inject({ method: 'PATCH',
url: `/admin/market-quotes/${mandioca.id}`,
headers: bearer(token),
payload: { unit: 'kg' } });
        expect(kg.statusCode, kg.body).toBe(200);
        expect(JSON.parse(kg.body)).toMatchObject({ unit: 'kg',
value: 'R$ 760,00 /kg' });

        const none = await app.inject({ method: 'PATCH',
url: `/admin/market-quotes/${mandioca.id}`,
headers: bearer(token),
payload: { unit: null } });
        expect(JSON.parse(none.body)).toMatchObject({ unit: null,
value: 'R$ 760,00' });

        const bad = await app.inject({ method: 'PATCH',
url: `/admin/market-quotes/${mandioca.id}`,
headers: bearer(token),
payload: { unit: 'litro' } });
        expect(bad.statusCode).toBe(400);
        const anon = await app.inject({ method: 'PATCH',
url: `/admin/market-quotes/${mandioca.id}`,
payload: { unit: 't' } });
        expect(anon.statusCode).toBe(401);
        await app.inject({ method: 'PATCH',
url: `/admin/market-quotes/${mandioca.id}`,
headers: bearer(token),
payload: { unit: 't' } });
    });

    it('lançamento do dia aparece no histórico público', async () => {
        const admin = JSON.parse((await app.inject({ method: 'GET',
url: '/admin/market-quotes',
headers: bearer(token) })).body) as {
 id: string;
label: string 
}[];
        const soja = admin.find(q => q.label === 'SOJA')!;
        const save = await app.inject({
            method: 'PUT',
            url: '/admin/market-quotes/daily',
            headers: bearer(token),
            payload: { period: 'MORNING',
prices: [{ id: soja.id,
priceCents: 13250 }] },
        });
        expect(save.statusCode, save.body).toBe(200);

        const hist = await app.inject({ method: 'GET',
url: '/market-quotes/history?days=30' });
        expect(hist.statusCode).toBe(200);
        const series = JSON.parse(hist.body) as {
 label: string;
points: {
 period: string;
priceCents: number 
}[] 
}[];
        const sojaSeries = series.find(s => s.label === 'SOJA');
        expect(sojaSeries?.points.at(-1)).toMatchObject({ period: 'MORNING',
priceCents: 13250 });
    });

    it('corrigir a manhã depois de lançar a tarde mantém a tarde como preço atual', async () => {
        const admin = JSON.parse((await app.inject({ method: 'GET',
url: '/admin/market-quotes',
headers: bearer(token) })).body) as {
            id: string;
label: string;
priceCents: number | null;
period: string | null;
        }[];
        const milho = admin.find(q => q.label === 'MILHO')!;
        const save = (period: string, priceCents: number) =>
            app.inject({ method: 'PUT',
url: '/admin/market-quotes/daily',
headers: bearer(token),
payload: { period,
prices: [{ id: milho.id,
priceCents }] } });
        expect((await save('MORNING', 6000)).statusCode).toBe(200);
        expect((await save('AFTERNOON', 6200)).statusCode).toBe(200);
        const after = JSON.parse((await save('MORNING', 6100)).body) as typeof admin;
        const current = after.find(q => q.id === milho.id)!;
        expect(current).toMatchObject({ priceCents: 6200,
period: 'AFTERNOON' });
        expect((current as unknown as { variation: string }).variation).toBe('+1,6%');

        const hist = JSON.parse((await app.inject({ method: 'GET',
url: '/market-quotes/history?days=7' })).body) as {
            label: string;
points: {
 period: string;
priceCents: number 
}[];
        }[];
        const points = hist.find(s => s.label === 'MILHO')!.points;
        expect(points.slice(-2)).toEqual([
            expect.objectContaining({ period: 'MORNING',
priceCents: 6100 }),
            expect.objectContaining({ period: 'AFTERNOON',
priceCents: 6200 }),
        ]);
    });
});

describe('Selos da lista de inscritos', () => {
    it('traz situação de associado, empresas parceiras e cargo público', async () => {
        const person = await prisma.userData.create({
            data: { name: 'JOSE ASSOCIADO',
email: 'jose@test.com',
phone: '44911112010',
memberStatus: 'ACTIVE' },
        });
        const company = await prisma.company.create({ data: { name: 'AGRO LTDA',
tradeName: 'AGRO',
isPartner: true } });
        await prisma.companyMember.create({ data: { companyId: company.id,
userDataId: person.id,
title: 'SOCIO' } });
        await prisma.publicContact.create({ data: { userDataId: person.id,
title: 'Tesoureiro' } });
        const room = await prisma.room.create({ data: { name: 'SALA 2',
description: 'x',
maxCapacity: 10 } });
        const course = await prisma.course.create({
            data: { name: 'CURSO',
description: 'x',
roomId: room.id,
startTime: new Date('2031-01-01T08:00:00Z'),
endTime: new Date('2031-01-01T12:00:00Z') },
        });
        await prisma.courseUserRegistration.create({ data: { courseId: course.id,
userDataId: person.id } });

        const res = await app.inject({ method: 'GET',
url: `/admin/courses/${course.id}/registrations`,
headers: bearer(token) });
        expect(res.statusCode).toBe(200);
        const reg = (JSON.parse(res.body) as { data: { userData: Record<string, unknown> }[] }).data[0];
        expect(reg.userData.memberStatus).toBe('ACTIVE');
        expect(reg.userData.publicContact).toEqual({ title: 'Tesoureiro' });
        expect(reg.userData.companyMemberships).toEqual([{ company: { name: 'AGRO LTDA',
tradeName: 'AGRO' } }]);
        expect(reg.userData).not.toHaveProperty('isPartner');
    });
});
