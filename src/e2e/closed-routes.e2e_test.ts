import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { hash } from 'bcrypt';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { Permission } from '../generated/prisma/enums.js';
import { createTestApp } from './helpers/create-test-app.js';
import { createTestPrisma, cleanDatabase, seedSuperAdmin, loginAndGetToken, bearer } from './helpers/db.js';
import { PUBLIC_FORM_LIMIT, PUBLIC_LOOKUP_LIMIT } from '../http/lib/public-rate-limit.js';

// SR-006: rotas que estavam abertas demais. Cada uma responde 401 sem token,
// 403 sem a permissão e funciona com ela; as rotas públicas de formulário
// ganharam limite próprio por IP.

let app: FastifyInstance;
let prisma: PrismaClient;
let superToken: string;
let seq = 0;

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

/** Admin com exatamente estas permissões; devolve o token dele. */
async function tokenWith(permissions: Permission[]): Promise<string> {
    seq += 1;
    const username = `closed${seq}`;
    const rule = await prisma.rule.create({ data: { name: `CLOSED_RULE_${seq}`,
description: 'E2E',
permissions } });
    const person = await prisma.userData.create({ data: { name: `Admin ${seq}`,
phone: `4490000${String(seq).padStart(4, '0')}` } });
    await prisma.userAdmin.create({
        data: { username,
passwordHash: await hash('closedPass123!', 4),
userDataId: person.id,
rulesId: rule.id },
    });
    return loginAndGetToken(app, username, 'closedPass123!');
}

beforeAll(async () => {
    prisma = createTestPrisma();
    await cleanDatabase(prisma);
    await seedSuperAdmin(prisma);
    app = await createTestApp(prisma);
    superToken = await loginAndGetToken(app);
});

afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
});

describe('POST /users exige CREATE_USER', () => {
    const payload = () => ({ name: 'Pessoa Nova',
phone: '44911119999',
cpf: cpfFrom(`7310${String(seq).padStart(5, '0')}`) });

    it('sem token → 401', async () => {
        const res = await app.inject({ method: 'POST',
url: '/users',
payload: payload() });
        expect(res.statusCode).toBe(401);
        expect(await prisma.userData.count({ where: { name: 'Pessoa Nova' } })).toBe(0);
    });

    it('sem CREATE_USER → 403', async () => {
        const token = await tokenWith(['READ_USER', 'UPDATE_USER']);
        const res = await app.inject({ method: 'POST',
url: '/users',
headers: bearer(token),
payload: payload() });
        expect(res.statusCode).toBe(403);
    });

    it('com CREATE_USER → 201', async () => {
        const token = await tokenWith(['CREATE_USER']);
        const res = await app.inject({ method: 'POST',
url: '/users',
headers: bearer(token),
payload: payload() });
        expect(res.statusCode).toBe(201);
    });
});

describe('ficha de inscrição', () => {
    const url = '/admin/registrations/00000000-0000-4000-8000-000000000000/ficha';

    it('baixar sem token → 401', async () => {
        const res = await app.inject({ method: 'GET',
url });
        expect(res.statusCode).toBe(401);
    });

    it('baixar sem READ_COURSE → 403', async () => {
        const token = await tokenWith(['READ_FINANCE', 'UPDATE_FINANCE']);
        const res = await app.inject({ method: 'GET',
url,
headers: bearer(token) });
        expect(res.statusCode).toBe(403);
    });

    it('baixar com READ_COURSE passa da permissão (404: não há ficha)', async () => {
        const token = await tokenWith(['READ_COURSE']);
        const res = await app.inject({ method: 'GET',
url,
headers: bearer(token) });
        expect(res.statusCode).toBe(404);
    });

    it('enviar e apagar sem UPDATE_COURSE → 403 (só ver não basta)', async () => {
        const token = await tokenWith(['READ_COURSE']);
        const post = await app.inject({ method: 'POST',
url,
headers: bearer(token) });
        expect(post.statusCode).toBe(403);
        const del = await app.inject({ method: 'DELETE',
url,
headers: bearer(token) });
        expect(del.statusCode).toBe(403);
    });

    it('enviar e apagar sem token → 401', async () => {
        expect((await app.inject({ method: 'POST',
url })).statusCode).toBe(401);
        expect((await app.inject({ method: 'DELETE',
url })).statusCode).toBe(401);
    });
});

describe('exportação "cadastros" exige READ_USER_ADMIN e READ_USER', () => {
    const url = '/admin/export/cadastros';

    it('sem token → 401', async () => {
        expect((await app.inject({ method: 'GET',
url })).statusCode).toBe(401);
    });

    it('só READ_USER_ADMIN → 403 (o arquivo traz CPF e RG de todas as pessoas)', async () => {
        const token = await tokenWith(['READ_USER_ADMIN']);
        expect((await app.inject({ method: 'GET',
url,
headers: bearer(token) })).statusCode).toBe(403);
    });

    it('só READ_USER → 403 (o arquivo traz os administradores)', async () => {
        const token = await tokenWith(['READ_USER']);
        expect((await app.inject({ method: 'POST',
url,
headers: bearer(token),
payload: {} })).statusCode).toBe(403);
    });

    it('com as duas → 200', async () => {
        const token = await tokenWith(['READ_USER_ADMIN', 'READ_USER']);
        const res = await app.inject({ method: 'GET',
url,
headers: bearer(token) });
        expect(res.statusCode).toBe(200);
        expect(res.headers['content-type']).toMatch(/text\/csv/);
    });

    it('as outras exportações continuam com uma permissão só', async () => {
        const token = await tokenWith(['READ_USER']);
        expect((await app.inject({ method: 'GET',
url: '/admin/export/people',
headers: bearer(token) })).statusCode).toBe(200);
    });
});

// Os limites só valem com o @fastify/rate-limit registrado, como no servidor
// (index.ts). O app padrão dos E2E fica sem ele.
describe('limite por IP nas rotas públicas', () => {
    let limited: FastifyInstance;

    beforeAll(async () => {
        limited = await createTestApp(prisma, { rateLimit: true });
    });

    afterAll(async () => {
        await limited.close();
    });

    async function hitUntilBlocked(
        method: 'GET' | 'POST',
        url: string,
        max: number,
    ): Promise<{
 before: number[];
blocked: {
 statusCode: number;
body: string 
} 
}> {
        const before: number[] = [];
        for (let i = 0; i < max; i++) {
            before.push((await limited.inject({ method,
url,
payload: method === 'POST' ? {} : undefined })).statusCode);
        }
        const blocked = await limited.inject({ method,
url,
payload: method === 'POST' ? {} : undefined });
        return { before,
blocked };
    }

    const course = '00000000-0000-4000-8000-000000000001';

    it.each([
        ['POST', '/users/lookup-cpf', PUBLIC_LOOKUP_LIMIT],
        ['POST', `/courses/${course}/register`, PUBLIC_FORM_LIMIT],
        ['POST', `/courses/${course}/register-by-cpf`, PUBLIC_FORM_LIMIT],
        ['POST', `/courses/${course}/register-full`, PUBLIC_FORM_LIMIT],
        ['POST', '/contacts/message', PUBLIC_FORM_LIMIT],
    ] as const)('%s %s: a chamada %s+1 do mesmo IP no minuto → 429', async (method, url, max) => {
        const { before, blocked } = await hitUntilBlocked(method, url, max);
        expect(before).not.toContain(429);
        expect(blocked.statusCode).toBe(429);
        expect(JSON.parse(blocked.body).error).toBe('Muitas tentativas seguidas. Aguarde um minuto e tente de novo.');
    });

    it('o limite de uma rota não gasta o de outra', async () => {
        // lookup-cpf e register-by-cpf já estouraram no teste anterior.
        const res = await limited.inject({ method: 'GET',
url: '/courses' });
        expect(res.statusCode).toBe(200);
    });
});

// O token do super admin também cria pessoa: garante que o 201 não depende de
// uma regra "só CREATE_USER".
it('super admin cria pessoa', async () => {
    const res = await app.inject({ method: 'POST',
url: '/users',
headers: bearer(superToken),
payload: { name: 'Pelo Super',
phone: '44911118888',
cpf: cpfFrom('731099991') } });
    expect(res.statusCode).toBe(201);
});
