import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fastify, { type FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import type { Permission } from '../../generated/prisma/enums.js';
import { withRouteAuth, publicRoute, loggedIn, requires, requiresFrom } from '../lib/route-auth.js';

// O hook da autorização por rota (decisão 001, SR-023) num app mínimo, com
// permissões falsas: as respostas têm de ser as mesmas de requirePermission.

const SECRET = 'x'.repeat(40);
const ADMINS: Record<string, Permission[]> = {
    reader: ['READ_USER'],
    both: ['READ_USER', 'UPDATE_USER'],
    nothing: [],
};
const execute = vi.fn(async (id: string) => ADMINS[id] ?? null);
const token = (userId: string, secret = SECRET) => ({ authorization: `Bearer ${jwt.sign({ userId }, secret)}` });

let app: FastifyInstance;
const seen: unknown[] = [];

beforeAll(async () => {
    vi.stubEnv('JWT_SECRET', SECRET);
    app = fastify({ logger: false });
    withRouteAuth(app, { execute }, api => {
        const echo = async (req: { admin: unknown }) => {
            seen.push(req.admin);
            return { ok: true };
        };
        api.get('/publica', { config: { auth: publicRoute() } }, echo);
        api.get('/login', { config: { auth: loggedIn() } }, echo);
        api.get('/le', { config: { auth: requires('READ_USER') } }, echo);
        api.post('/le-e-edita', { config: { auth: requires('READ_USER', 'UPDATE_USER') } }, echo);
        api.get('/calculada/:tipo', {
            config: {
                auth: requiresFrom(req => {
                    const { tipo } = req.params as { tipo: string };
                    return tipo === 'livre' ? null : [tipo as Permission];
                }),
            },
        }, echo);
        api.get('/sem-declaracao', echo);
        api.get('/pendente/:id', echo);
        api.post('/upload', { config: { auth: requires('UPDATE_USER') } }, async req => ({ body: req.body }));
    }, { pending: ['GET /pendente/:id'] });
    await app.ready();
});

afterAll(async () => {
    vi.unstubAllEnvs();
    await app.close();
});

const call = (method: 'GET' | 'POST', url: string, headers: Record<string, string> = {}, payload?: unknown) =>
    app.inject({ method,
url,
headers,
payload: payload as never });

describe('autorização declarada na rota', () => {
    it('pública: passa sem token e não preenche request.admin', async () => {
        seen.length = 0;
        expect((await call('GET', '/publica')).statusCode).toBe(200);
        expect(seen).toEqual([null]);
    });

    it('login: sem token ou com token inválido → 401 Unauthorized; admin sem regra → 401 Admin not found', async () => {
        for (const headers of [{}, { authorization: 'Bearer lixo' }, token('reader', 'y'.repeat(40))]) {
            const res = await call('GET', '/login', headers);
            expect(res.statusCode).toBe(401);
            expect(JSON.parse(res.body)).toEqual({ error: 'Unauthorized' });
        }
        const gone = await call('GET', '/login', token('excluido'));
        expect(gone.statusCode).toBe(401);
        expect(JSON.parse(gone.body)).toEqual({ error: 'Admin not found' });
    });

    it('login: qualquer admin, mesmo sem permissão nenhuma; request.admin preenchido', async () => {
        seen.length = 0;
        expect((await call('GET', '/login', token('nothing'))).statusCode).toBe(200);
        expect(seen).toEqual([expect.objectContaining({ id: 'nothing',
permissions: [] })]);
    });

    it('requires: falta a permissão → 403 Forbidden; com ela, passa', async () => {
        const res = await call('GET', '/le', token('nothing'));
        expect(res.statusCode).toBe(403);
        expect(JSON.parse(res.body)).toEqual({ error: 'Forbidden' });
        expect((await call('GET', '/le', token('reader'))).statusCode).toBe(200);
        expect((await call('GET', '/le')).statusCode).toBe(401);
    });

    it('requires com duas permissões exige as duas', async () => {
        expect((await call('POST', '/le-e-edita', token('reader'), {})).statusCode).toBe(403);
        expect((await call('POST', '/le-e-edita', token('both'), {})).statusCode).toBe(200);
    });

    it('requiresFrom: calcula pelos params; null vira só o login', async () => {
        expect((await call('GET', '/calculada/UPDATE_USER', token('reader'))).statusCode).toBe(403);
        expect((await call('GET', '/calculada/READ_USER', token('reader'))).statusCode).toBe(200);
        expect((await call('GET', '/calculada/livre', token('nothing'))).statusCode).toBe(200);
        expect((await call('GET', '/calculada/livre')).statusCode).toBe(401);
    });

    it('request.admin.has confere as permissões', async () => {
        seen.length = 0;
        await call('GET', '/le', token('reader'));
        const admin = seen[0] as { has(p: Permission): boolean };
        expect(admin.has('READ_USER')).toBe(true);
        expect(admin.has('UPDATE_USER')).toBe(false);
    });

    it('rota sem declaração → 500 e o handler não roda, nem com token de quem pode tudo', async () => {
        seen.length = 0;
        const res = await call('GET', '/sem-declaracao', token('both'));
        expect(res.statusCode).toBe(500);
        expect(JSON.parse(res.body)).toEqual({ error: 'Rota sem regra de acesso.' });
        expect(seen).toEqual([]);
    });

    it('rota pendente passa sem checagem (o controller ainda confere do jeito antigo)', async () => {
        expect((await call('GET', '/pendente/1')).statusCode).toBe(200);
    });

    it('HEAD usa a declaração do GET', async () => {
        expect((await app.inject({ method: 'HEAD',
url: '/le' })).statusCode).toBe(401);
        expect((await app.inject({ method: 'HEAD',
url: '/pendente/1' })).statusCode).toBe(200);
    });

    it('a checagem vem antes do corpo: sem permissão, nem lê', async () => {
        const res = await call('POST', '/upload', token('reader'), { grande: 'x'.repeat(1000) });
        expect(res.statusCode).toBe(403);
        const ok = await call('POST', '/upload', token('both'), { a: 1 });
        expect(JSON.parse(ok.body)).toEqual({ body: { a: 1 } });
    });

    it('rota inexistente continua 404', async () => {
        expect((await call('GET', '/nao-existe')).statusCode).toBe(404);
    });

    it('uma consulta de permissões por request', async () => {
        execute.mockClear();
        await call('POST', '/le-e-edita', token('both'), {});
        expect(execute).toHaveBeenCalledTimes(1);
    });
});
