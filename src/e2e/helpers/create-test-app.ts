import fastify from 'fastify';
import '../../lib/zod-config.js';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { registerRouters } from '../../http/register-routers.js';
import { apiErrorHandler } from '../../http/error-handler.js';
import { registerAuditHooks } from '../../http/audit-hooks.js';
import { AJV_CUSTOM_OPTIONS, parseJsonBody } from '../../http/lib/request-parsing.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { FastifyInstance } from 'fastify';

// `rateLimit: true` liga os limites por rota (login, rotas públicas), como no
// servidor. Fica desligado por padrão: os testes fazem muitas chamadas seguidas
// do mesmo "IP" e esbarrariam no limite do login.
export async function createTestApp(
    prisma: PrismaClient,
    options: { rateLimit?: boolean } = {},
): Promise<FastifyInstance> {
    // Mesmas opções de AJV e o mesmo parser de JSON do servidor real.
    const app = fastify({ logger: false,
ajv: { customOptions: AJV_CUSTOM_OPTIONS } });

    app.addContentTypeParser('application/json', { parseAs: 'string' }, parseJsonBody);

    app.register(cors, {
        origin: true,
        credentials: true,
        methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    });
    app.register(multipart);
    if (options.rateLimit) app.register(rateLimit, { global: false });

    registerAuditHooks(app, prisma);
    registerRouters(app, prisma);
    app.setErrorHandler(apiErrorHandler);

    await app.ready();
    return app;
}
