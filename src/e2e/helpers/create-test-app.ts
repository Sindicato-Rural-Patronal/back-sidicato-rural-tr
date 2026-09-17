import fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { registerRouters } from '../../http/register-routers.js';
import { apiErrorHandler } from '../../http/error-handler.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { FastifyInstance } from 'fastify';

export async function createTestApp(prisma: PrismaClient): Promise<FastifyInstance> {
    // Mesmas opções de AJV do servidor real (as rotas documentam `example`).
    const app = fastify({ logger: false,
ajv: { customOptions: { keywords: ['example'] } } });

    app.addContentTypeParser(
        'application/json',
        { parseAs: 'string' },
        function (_req, body, done) {
            if (body === '' || body === null || body === undefined) {
                done(null, {});
                return;
            }
            try {
                done(null, JSON.parse(body as string));
            } catch (err) {
                done(err as Error, undefined);
            }
        },
    );

    app.register(cors, {
        origin: true,
        credentials: true,
        methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    });
    app.register(multipart);

    registerRouters(app, prisma);
    app.setErrorHandler(apiErrorHandler);

    await app.ready();
    return app;
}
