import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import jwt from 'jsonwebtoken';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '../generated/prisma/client.js';
import { createTestApp } from './helpers/create-test-app.js';
import { createTestPrisma, cleanDatabase, seedSuperAdmin, loginAndGetToken, bearer } from './helpers/db.js';

// Ajustes de usabilidade contra o Postgres de verdade: busca sem acento (colunas
// preenchidas por trigger), CPF só com dígitos, renovação de sessão, inscrição
// feita pelo painel, campos novos das respostas e frases da auditoria.

let app: FastifyInstance;
let prisma: PrismaClient;
let token: string;
let adminId: string;
const ids: Record<string, string> = {};

beforeAll(async () => {
    prisma = createTestPrisma();
    await cleanDatabase(prisma);
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "AuditLog"');
    const seeded = await seedSuperAdmin(prisma);
    adminId = seeded.userAdmin.id;
    app = await createTestApp(prisma);
    token = await loginAndGetToken(app);

    const joao = await prisma.userData.create({
        data: { name: 'JOÃO DA CONCEIÇÃO',
email: 'joao.usab@test.com',
phone: '44922220001' },
    });
    const maria = await prisma.userData.create({
        data: { name: 'MARIA USABILIDADE',
email: 'maria.usab@test.com',
phone: '44922220002' },
    });
    const pedro = await prisma.userData.create({
        data: { name: 'PEDRO USABILIDADE',
email: 'pedro.usab@test.com',
phone: '44922220003' },
    });
    const company = await prisma.company.create({
        data: { name: 'AGROPECUÁRIA SÃO JOSÉ LTDA',
tradeName: 'SÃO JOSÉ' },
    });
    const room = await prisma.room.create({ data: { name: 'SALA 1',
description: 'x',
maxCapacity: 2 } });
    const course = await prisma.course.create({
        data: {
            name: 'CURSO USABILIDADE',
            description: 'x',
            roomId: room.id,
            status: 'PUBLIC',
            startTime: new Date('2032-03-01T08:00:00Z'),
            endTime: new Date('2032-03-02T17:00:00Z'),
            // Horário de parede gravado como Z (padrão do painel): prazo 20/02 às 18:00.
            registrationDeadline: new Date('2032-02-20T18:00:00Z'),
        },
    });
    const instructor = await prisma.userInstructor.create({ data: { userDataId: maria.id } });
    await prisma.courseInstructor.create({ data: { courseId: course.id,
instructorId: instructor.id } });
    const message = await prisma.contactMessage.create({
        data: { name: 'VISITANTE',
email: 'visitante@test.com',
message: 'oi',
read: true },
    });
    Object.assign(ids, {
        joao: joao.id,
        maria: maria.id,
        pedro: pedro.id,
        company: company.id,
        course: course.id,
        message: message.id,
    });
});

afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
});

const get = (url: string) => app.inject({ method: 'GET',
url,
headers: bearer(token) });
const names = (body: string) => (JSON.parse(body) as { data: { name: string }[] }).data.map(p => p.name);

describe('Busca sem acento e CPF só com dígitos', () => {
    it('pessoas e empresas: sem acento e sem diferença de maiúsculas', async () => {
        for (const term of ['joao', 'CONCEIÇÃO', 'joão da conceicao']) {
            const res = await get(`/admin/users?search=${encodeURIComponent(term)}`);
            expect(res.statusCode, res.body).toBe(200);
            expect(names(res.body), term).toContain('JOÃO DA CONCEIÇÃO');
        }
        for (const term of ['agropecuaria', 'sao jose']) {
            const res = await get(`/admin/companies?search=${encodeURIComponent(term)}`);
            expect(res.statusCode, res.body).toBe(200);
            expect(names(res.body), term).toContain('AGROPECUÁRIA SÃO JOSÉ LTDA');
        }
    });

    it('CPF com máscara é gravado só com dígitos e achado com ou sem pontos; renomear atualiza a busca', async () => {
        const res = await app.inject({
            method: 'PATCH',
            url: `/users/${ids.joao}`,
            headers: bearer(token),
            payload: { cpf: '529.982.247-25',
name: 'JOSÉ RENOMEADO' },
        });
        expect(res.statusCode, res.body).toBe(200);
        const saved = await prisma.userData.findUnique({ where: { id: ids.joao } });
        expect(saved?.cpf).toBe('52998224725');

        for (const term of ['529.982.247', '52998224725', 'jose renomeado']) {
            const found = await get(`/admin/users?search=${encodeURIComponent(term)}`);
            expect(names(found.body), term).toContain('JOSÉ RENOMEADO');
        }
        const old = await get('/admin/users?search=conceicao');
        expect(names(old.body)).not.toContain('JOSÉ RENOMEADO');
    });
});

describe('Renovação de sessão', () => {
    it('troca um token válido por outro e guarda o momento do login', async () => {
        const res = await app.inject({ method: 'POST',
url: '/auth/refresh',
headers: bearer(token) });
        expect(res.statusCode, res.body).toBe(200);
        const renewed = JSON.parse(res.body) as { token: string };
        const before = jwt.decode(token) as { authTime: number };
        const after = jwt.decode(renewed.token) as {
 authTime: number;
exp: number;
iat: number 
};
        expect(after.authTime).toBe(before.authTime);
        expect(after.exp - after.iat).toBe(8 * 60 * 60);
    });

    it('sem token, ou com login de mais de 24h, pede login de novo', async () => {
        const none = await app.inject({ method: 'POST',
url: '/auth/refresh' });
        expect(none.statusCode).toBe(401);

        const old = jwt.sign(
            { userId: adminId,
username: 'e2eadmin',
role: 'x',
authTime: Math.floor(Date.now() / 1000) - 25 * 60 * 60 },
            process.env.JWT_SECRET!,
            { expiresIn: '1h' },
        );
        const res = await app.inject({ method: 'POST',
url: '/auth/refresh',
headers: bearer(old) });
        expect(res.statusCode).toBe(401);
    });
});

describe('Inscrição feita pelo painel', () => {
    it('inscreve já confirmada; repetida dá 409', async () => {
        const url = `/admin/courses/${ids.course}/registrations`;
        const res = await app.inject({ method: 'POST',
url,
headers: bearer(token),
payload: { userDataId: ids.joao } });
        expect(res.statusCode, res.body).toBe(201);
        const { registrationId } = JSON.parse(res.body) as { registrationId: string };
        const reg = await prisma.courseUserRegistration.findUnique({ where: { id: registrationId } });
        expect(reg?.confirmed).toBe(true);

        const again = await app.inject({ method: 'POST',
url,
headers: bearer(token),
payload: { userDataId: ids.joao } });
        expect(again.statusCode).toBe(409);
    });

    it('confirmar todas confirma as pendentes; curso lotado recusa', async () => {
        await prisma.courseUserRegistration.create({
            data: { courseId: ids.course,
userDataId: ids.maria,
confirmed: false },
        });
        const confirm = await app.inject({
            method: 'PATCH',
            url: `/admin/courses/${ids.course}/registrations/confirm-all`,
            headers: bearer(token),
        });
        expect(confirm.statusCode, confirm.body).toBe(200);
        expect(JSON.parse(confirm.body)).toEqual({ confirmed: 1 });

        // Sala com 2 vagas e 2 inscritos.
        const full = await app.inject({
            method: 'POST',
            url: `/admin/courses/${ids.course}/registrations`,
            headers: bearer(token),
            payload: { userDataId: ids.pedro },
        });
        expect(full.statusCode).toBe(409);
    });
});

describe('Campos novos nas respostas', () => {
    it('curso: prazo com hora, miniatura e pessoa do instrutor', async () => {
        const res = await get(`/admin/courses/${ids.course}`);
        expect(res.statusCode, res.body).toBe(200);
        const course = JSON.parse(res.body) as Record<string, unknown> & { instructors: Record<string, unknown>[] };
        expect(course.registrationDeadline).toBe('2032-02-20');
        expect(course.registrationDeadlineTime).toBe('18:00');
        expect(course).toHaveProperty('coverImageThumb', null);
        expect(course.instructors[0].userDataId).toBe(ids.maria);

        const pub = await app.inject({ method: 'GET',
url: `/courses/${ids.course}` });
        expect(pub.statusCode, pub.body).toBe(200);
        expect((JSON.parse(pub.body) as Record<string, unknown>).registrationDeadlineTime).toBe('18:00');
    });

    it('financeiro: lista traz os totais do filtro', async () => {
        const res = await get('/admin/finance/transactions');
        expect(res.statusCode, res.body).toBe(200);
        expect((JSON.parse(res.body) as { totals: unknown }).totals).toEqual({ incomeCents: 0,
expenseCents: 0 });
    });

    it('mensagem pode voltar a ficar não lida', async () => {
        const res = await app.inject({
            method: 'PATCH',
            url: `/admin/contacts/messages/${ids.message}/unread`,
            headers: bearer(token),
        });
        expect(res.statusCode, res.body).toBe(200);
        const msg = await prisma.contactMessage.findUnique({ where: { id: ids.message } });
        expect(msg?.read).toBe(false);
    });

    it('auditoria descreve as ações em frases e não registra a renovação de sessão', async () => {
        const res = await get('/admin/audit-logs?limit=100');
        expect(res.statusCode, res.body).toBe(200);
        const rows = (JSON.parse(res.body) as {
 data: {
 summary: string;
path: string 
}[] 
}).data;
        const summaries = rows.map(r => r.summary);
        expect(summaries.some(s => s.startsWith('Inscreveu uma pessoa no curso'))).toBe(true);
        expect(summaries.some(s => s.startsWith('Confirmou todas as inscrições'))).toBe(true);
        expect(rows.some(r => r.path === '/auth/refresh')).toBe(false);
    });
});
