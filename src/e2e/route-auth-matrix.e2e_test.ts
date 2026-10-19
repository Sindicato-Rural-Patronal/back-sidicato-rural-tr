import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fastify, { type FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { hash } from 'bcrypt';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { Permission } from '../generated/prisma/enums.js';
import { registerRouters } from '../http/register-routers.js';
import { routeKey, type RouteAuthEntry } from '../http/lib/route-auth.js';
import { EXPORT_DATASETS } from '../usecase/export-data.js';
import { createTestApp } from './helpers/create-test-app.js';
import {
    createTestPrisma,
    cleanDatabase,
    seedSuperAdmin,
    loginAndGetToken,
    bearer,
} from './helpers/db.js';

// SR-024: matriz de autorização de TODAS as rotas (decisão 001, SR-023).
//
// Os casos saem das rotas registradas (o mesmo `registerRouters` do servidor),
// e não de uma lista escrita à mão: rota nova entra na matriz sozinha.
//
// - rota não pública, sem token (ou com token inválido) → 401;
// - rota `requires`/`requiresFrom`, com um admin cuja regra não tem nenhuma
//   permissão → 403 `Forbidden`;
// - rota `loggedIn`, com esse mesmo admin → nem 401 nem 403;
// - o super admin passa em todas as rotas não públicas (prova de que o 403 de
//   cima vem da permissão, e não de a rota estar quebrada);
// - rota pública responde sem token.
//
// Parâmetros de caminho vão com UUID aleatório e o corpo é `{}`: a checagem
// roda antes da validação, então isso basta. O que cada rota responde depois
// de passar na checagem (400, 404…) não é assunto daqui.

type Route = {
    method: string;
    url: string;
    auth: NonNullable<RouteAuthEntry['auth']>;
};
type Case = {
    label: string;
    route: Route;
    path: string;
};

/** As rotas registradas, lidas do mesmo hook que o teste de inventário usa. */
async function loadRoutes(): Promise<Route[]> {
    const inventory: RouteAuthEntry[] = [];
    const app = fastify({ logger: false,
ajv: { customOptions: { keywords: ['example'] } } });
    registerRouters(app, {} as PrismaClient, inventory);
    await app.ready();
    await app.close();
    // O HEAD que o Fastify cria para cada GET não conta.
    return inventory
        .filter(r => r.method !== 'HEAD')
        .map(r => {
            if (!r.auth)
                throw new Error(
                    `Rota sem declaração: ${routeKey(r.method, r.url)} (veja o teste de inventário)`,
                );
            return { method: r.method,
url: r.url,
auth: r.auth };
        });
}

const routes = await loadRoutes();

/** Preenche os `:parametros` do caminho. */
function fill(url: string, overrides: Record<string, string> = {}): string {
    return url.replace(/:([A-Za-z]+)/g, (_m, name: string) => overrides[name] ?? randomUUID());
}

/**
 * Um caso por rota. A exportação (`requiresFrom` pelo conjunto) vira um caso
 * por conjunto, porque o UUID aleatório cairia no ramo "conjunto inexistente",
 * que só pede login. O CEP vai inválido de propósito: rota que passa na
 * checagem não pode consultar o ViaCEP.
 */
function casesFor(list: Route[]): Case[] {
    return list.flatMap(route => {
        const label = routeKey(route.method, route.url);
        if (route.url.includes(':dataset')) {
            return Object.keys(EXPORT_DATASETS).map(dataset => ({
                label: `${label} [${dataset}]`,
                route,
                path: fill(route.url, { dataset }),
            }));
        }
        return [{ label,
route,
path: fill(route.url, { cep: 'abc' }) }];
    });
}

const publicCases = casesFor(routes.filter(r => r.auth.kind === 'public'));
const protectedCases = casesFor(routes.filter(r => r.auth.kind !== 'public'));
const permissionCases = protectedCases.filter(
    c => c.route.auth.kind === 'requires' || c.route.auth.kind === 'requiresFrom',
);
const loggedInCases = protectedCases.filter(c => c.route.auth.kind === 'loggedIn');

let app: FastifyInstance;
let prisma: PrismaClient;
let superToken: string;
let nobodyToken: string;
let seq = 0;

/** Admin com exatamente estas permissões; devolve o token dele. */
async function tokenWith(permissions: Permission[]): Promise<string> {
    seq += 1;
    const username = `matrix${seq}`;
    const rule = await prisma.rule.create({
        data: { name: `MATRIX_RULE_${seq}`,
description: 'E2E',
permissions },
    });
    const person = await prisma.userData.create({
        data: { name: `Matrix ${seq}`,
phone: `4491000${String(seq).padStart(4, '0')}` },
    });
    await prisma.userAdmin.create({
        data: {
            username,
            passwordHash: await hash('matrixPass123!', 4),
            userDataId: person.id,
            rulesId: rule.id,
        },
    });
    return loginAndGetToken(app, username, 'matrixPass123!');
}

function call(c: Case, headers: Record<string, string> = {}) {
    const hasBody = c.route.method !== 'GET' && c.route.method !== 'DELETE';
    return app.inject({
        method: c.route.method as 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
        url: c.path,
        headers,
        ...(hasBody && { payload: {} }),
    });
}

beforeAll(async () => {
    prisma = createTestPrisma();
    await cleanDatabase(prisma);
    await seedSuperAdmin(prisma);
    app = await createTestApp(prisma);
    superToken = await loginAndGetToken(app);
    nobodyToken = await tokenWith([]);
});

afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
});

describe('a matriz parte das rotas registradas', () => {
    it('lê as rotas e separa por tipo', () => {
        expect(routes.length).toBeGreaterThan(150);
        expect(publicCases.length).toBeGreaterThan(0);
        expect(permissionCases.length).toBeGreaterThan(100);
        expect(loggedInCases.length).toBeGreaterThan(0);
        expect(new Set(routes.map(r => routeKey(r.method, r.url))).size).toBe(routes.length);
    });

    it('a exportação tem um caso por conjunto de dados', () => {
        const exportCases = protectedCases.filter(c => c.route.url === '/admin/export/:dataset');
        expect(exportCases.length).toBe(2 * Object.keys(EXPORT_DATASETS).length);
    });
});

describe('rota não pública, sem token → 401', () => {
    it.each(protectedCases.map(c => [c.label, c] as const))('%s', async (_label, c) => {
        const res = await call(c);
        expect(res.statusCode).toBe(401);
        expect(res.json()).toEqual({ error: 'Unauthorized' });
    });
});

describe('rota não pública, com token inválido → 401', () => {
    it.each(protectedCases.map(c => [c.label, c] as const))('%s', async (_label, c) => {
        const res = await call(c, {
            authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.invalid.signature',
        });
        expect(res.statusCode).toBe(401);
        expect(res.json()).toEqual({ error: 'Unauthorized' });
    });
});

describe('rota com permissão, com admin sem nenhuma permissão → 403', () => {
    it.each(permissionCases.map(c => [c.label, c] as const))('%s', async (_label, c) => {
        const res = await call(c, bearer(nobodyToken));
        expect(res.statusCode).toBe(403);
        expect(res.json()).toEqual({ error: 'Forbidden' });
    });
});

describe('rota "só login", com admin sem nenhuma permissão → passa da checagem', () => {
    it.each(loggedInCases.map(c => [c.label, c] as const))('%s', async (_label, c) => {
        const res = await call(c, bearer(nobodyToken));
        expect([401, 403]).not.toContain(res.statusCode);
        expect(res.statusCode).toBeLessThan(500);
    });
});

describe('super admin passa da checagem em toda rota não pública', () => {
    it.each(protectedCases.map(c => [c.label, c] as const))('%s', async (_label, c) => {
        const res = await call(c, bearer(superToken));
        expect([401, 403]).not.toContain(res.statusCode);
    });
});

describe('rota pública responde sem token', () => {
    it.each(publicCases.map(c => [c.label, c] as const))('%s', async (_label, c) => {
        const res = await call(c);
        expect([401, 403]).not.toContain(res.statusCode);
        expect(res.statusCode).toBeLessThan(500);
    });
});

describe('o conjunto `cadastros` da exportação pede as duas permissões', () => {
    it('só com READ_USER → 403', async () => {
        const token = await tokenWith(['READ_USER']);
        const res = await app.inject({
            method: 'GET',
            url: '/admin/export/cadastros',
            headers: bearer(token),
        });
        expect(res.statusCode).toBe(403);
    });

    it('só com READ_USER_ADMIN → 403', async () => {
        const token = await tokenWith(['READ_USER_ADMIN']);
        const res = await app.inject({
            method: 'GET',
            url: '/admin/export/cadastros',
            headers: bearer(token),
        });
        expect(res.statusCode).toBe(403);
    });

    it('com as duas → passa', async () => {
        const token = await tokenWith(['READ_USER', 'READ_USER_ADMIN']);
        const res = await app.inject({
            method: 'GET',
            url: '/admin/export/cadastros',
            headers: bearer(token),
        });
        expect(res.statusCode).toBe(200);
    });

    it('conjunto inexistente → só o login: 400 do schema, e 401 sem token', async () => {
        const logged = await app.inject({
            method: 'GET',
            url: '/admin/export/nao-existe',
            headers: bearer(nobodyToken),
        });
        expect(logged.statusCode).toBe(400);
        const anon = await app.inject({ method: 'GET',
url: '/admin/export/nao-existe' });
        expect(anon.statusCode).toBe(401);
    });
});

describe('as três rotas que fecharam na decisão 001', () => {
    const missingCourse = randomUUID();

    it('POST /courses/:id/register não existe mais: 404 com e sem token', async () => {
        const url = `/courses/${missingCourse}/register`;
        const anon = await app.inject({
            method: 'POST',
            url,
            payload: { name: 'X',
phone: '44999999999',
cpf: '52998224725' },
        });
        expect(anon.statusCode).toBe(404);
        const admin = await app.inject({
            method: 'POST',
            url,
            headers: bearer(superToken),
            payload: {},
        });
        expect(admin.statusCode).toBe(404);
        expect(routes.some(r => r.url === '/courses/:courseId/register')).toBe(false);
    });

    it('GET /rooms: sem token 401, sem READ_COURSE 403, com READ_COURSE 200', async () => {
        expect((await app.inject({ method: 'GET',
url: '/rooms' })).statusCode).toBe(401);
        expect(
            (await app.inject({ method: 'GET',
url: '/rooms',
headers: bearer(nobodyToken) }))
                .statusCode,
        ).toBe(403);
        const reader = await tokenWith(['READ_COURSE']);
        const ok = await app.inject({ method: 'GET',
url: '/rooms',
headers: bearer(reader) });
        expect(ok.statusCode).toBe(200);
        expect(Array.isArray((ok.json() as { data: unknown }).data)).toBe(true);
    });

    it('GET /address/cep/:cep: sem token 401; com login (sem permissão nenhuma) passa da checagem', async () => {
        expect((await app.inject({ method: 'GET',
url: '/address/cep/abc' })).statusCode).toBe(401);
        // CEP inválido de propósito: responde 400 sem consultar o ViaCEP.
        const logged = await app.inject({
            method: 'GET',
            url: '/address/cep/abc',
            headers: bearer(nobodyToken),
        });
        expect(logged.statusCode).toBe(400);
    });
});
