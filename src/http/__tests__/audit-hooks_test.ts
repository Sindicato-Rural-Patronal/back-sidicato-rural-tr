import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fastify, { type FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import jwt from 'jsonwebtoken';
import { registerAuditHooks, fillAuditLocationLater } from '../audit-hooks.js';

// Hooks da auditoria num app mínimo, com um prisma falso (sem banco).

vi.mock('../../lib/geoip.js', () => ({
    lookupLocation: vi.fn(async (ip: string | null) => (ip === '177.8.8.8' ? 'Terra Roxa, PR, Brasil' : null)),
}));

const ID = '3f2b8c1e-4a5d-4e6f-8a9b-0c1d2e3f4a5b';
const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const token = () => jwt.sign({ userId: 'admin-1' }, process.env.JWT_SECRET!);

let app: FastifyInstance;
let person: Record<string, unknown> | null;
let prisma: {
    auditLog: {
        create: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
    };
    userData: { findUnique: ReturnType<typeof vi.fn> };
    userAdmin: { findFirst: ReturnType<typeof vi.fn> };
};

/** Dados da única linha gravada (espera o onResponse, que roda depois da resposta). */
async function loggedRow(): Promise<Record<string, unknown>> {
    await vi.waitFor(() => expect(prisma.auditLog.create).toHaveBeenCalledTimes(1));
    return prisma.auditLog.create.mock.calls[0][0].data;
}

beforeEach(async () => {
    person = { id: ID,
name: 'JOÃO',
email: 'joao@x.com',
phone: '44999990000',
nameSearch: 'joao',
updatedAt: new Date() };
    prisma = {
        auditLog: { create: vi.fn().mockResolvedValue({}),
update: vi.fn().mockResolvedValue({}) },
        userData: { findUnique: vi.fn(async () => (person ? { ...person } : null)) },
        // Só "bali" existe como admin.
        userAdmin: { findFirst: vi.fn(async ({ where }: { where: { username: string } }) => (where.username === 'bali' ? { id: 'admin-1' } : null)) },
    };
    app = fastify();
    await app.register(rateLimit, { global: false });
    registerAuditHooks(app, prisma);

    app.patch('/users/:id', async () => {
        person = { ...person!,
email: null,
updatedAt: new Date() };
        return { ok: true };
    });
    app.delete('/users/:id', async (_req, reply) => {
        person = null;
        return reply.status(204).send();
    });
    // Mesmo limite da rota real: conta em preValidation, com o corpo já lido.
    app.post('/auth/login', { config: { rateLimit: { max: 2,
timeWindow: '1 minute',
hook: 'preValidation' } } }, async (req, reply) => {
        const { password } = req.body as { password: string };
        if (password !== 'senha-certa') return reply.status(401).send({ error: 'Invalid credentials' });
        return { token: token() };
    });
    app.get('/admin/export/people', async (req, reply) => {
        fillAuditLocationLater(req, 'log-1');
        return reply.send('csv');
    });
    await app.ready();
});

afterEach(async () => {
    await app.close();
});

describe('auditoria: de onde veio e o que mudou', () => {
    it('edição guarda IP, navegador, local e os campos alterados', async () => {
        const res = await app.inject({
            method: 'PATCH',
            url: `/users/${ID}`,
            headers: { authorization: `Bearer ${token()}`,
'user-agent': CHROME },
            remoteAddress: '177.8.8.8',
            payload: { email: '' },
        });
        expect(res.statusCode).toBe(200);
        const row = await loggedRow();
        expect(row).toMatchObject({
            actorId: 'admin-1',
            method: 'PATCH',
            entity: 'Usuário',
            targetLabel: 'JOÃO',
            ip: '177.8.8.8',
            userAgent: CHROME,
            location: 'Terra Roxa, PR, Brasil',
            changes: [{ field: 'email',
before: 'joao@x.com',
after: null }],
        });
    });

    it('exclusão guarda o registro removido como "antes"', async () => {
        await app.inject({ method: 'DELETE',
url: `/users/${ID}`,
headers: { authorization: `Bearer ${token()}` },
remoteAddress: '10.0.0.1' });
        const row = await loggedRow();
        expect(row.location).toBeNull();
        expect(row.changes).toEqual([
            { field: 'name',
before: 'JOÃO',
after: null },
            { field: 'email',
before: 'joao@x.com',
after: null },
            { field: 'phone',
before: '44999990000',
after: null },
        ]);
    });

    it('falha ao ler o registro não derruba a request nem a linha', async () => {
        prisma.userData.findUnique.mockRejectedValue(new Error('banco fora'));
        const res = await app.inject({ method: 'PATCH',
url: `/users/${ID}`,
headers: { authorization: `Bearer ${token()}` },
payload: {} });
        expect(res.statusCode).toBe(200);
        const row = await loggedRow();
        expect(row.changes).toBeUndefined();
        expect(row.method).toBe('PATCH');
    });

    it('sem token não lê o registro', async () => {
        await app.inject({ method: 'PATCH',
url: `/users/${ID}`,
payload: {} });
        await loggedRow();
        expect(prisma.userData.findUnique).not.toHaveBeenCalled();
    });

    it('exportação: o local é preenchido depois da resposta', async () => {
        await app.inject({ method: 'GET',
url: '/admin/export/people',
remoteAddress: '177.8.8.8' });
        await vi.waitFor(() => expect(prisma.auditLog.update).toHaveBeenCalledWith({ where: { id: 'log-1' },
data: { location: 'Terra Roxa, PR, Brasil' } }));
        expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });
});

describe('auditoria: tentativas de login', () => {
    const login = (password: string, username = 'bali') =>
        app.inject({ method: 'POST',
url: '/auth/login',
payload: { username,
password },
remoteAddress: '177.8.8.8',
headers: { 'user-agent': CHROME } });

    it('login certo: LOGIN com o id do admin', async () => {
        expect((await login('senha-certa')).statusCode).toBe(200);
        const row = await loggedRow();
        expect(row).toMatchObject({ method: 'LOGIN',
actorId: 'admin-1',
targetLabel: 'bali',
ip: '177.8.8.8',
location: 'Terra Roxa, PR, Brasil' });
        expect(JSON.stringify(row)).not.toContain('senha-certa');
    });

    it('senha errada: LOGIN_FAILED com o usuário digitado e nunca a senha', async () => {
        expect((await login('senha-errada-123')).statusCode).toBe(401);
        const row = await loggedRow();
        expect(row).toMatchObject({ method: 'LOGIN_FAILED',
actorId: null,
targetLabel: 'bali',
statusCode: 401 });
        expect(JSON.stringify(row)).not.toContain('senha-errada-123');
    });

    it('usuário que não existe não fica gravado (pode ser a senha digitada no campo errado)', async () => {
        expect((await login('qualquer', 'MinhaSenha#2026')).statusCode).toBe(401);
        const row = await loggedRow();
        expect(row).toMatchObject({ method: 'LOGIN_FAILED',
targetLabel: '(usuário inexistente)' });
        expect(JSON.stringify(row)).not.toContain('MinhaSenha#2026');
    });

    it('bloqueio por excesso de tentativas: uma linha LOGIN_BLOCKED por IP na janela, sem consultar local', async () => {
        await login('errada');
        await login('errada');
        expect((await login('errada')).statusCode).toBe(429);
        await vi.waitFor(() => expect(prisma.auditLog.create).toHaveBeenCalledTimes(3));
        const blocked = prisma.auditLog.create.mock.calls[2][0].data;
        expect(blocked).toMatchObject({ method: 'LOGIN_BLOCKED',
targetLabel: 'bali',
statusCode: 429,
location: null });
        // Mais tentativas bloqueadas do mesmo IP não geram linhas novas.
        expect((await login('errada')).statusCode).toBe(429);
        expect((await login('errada')).statusCode).toBe(429);
        await new Promise(r => setTimeout(r, 50));
        expect(prisma.auditLog.create).toHaveBeenCalledTimes(3);
        expect(JSON.stringify(prisma.auditLog.create.mock.calls)).not.toContain('errada');
    });
});
