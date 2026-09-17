import fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { registerRouters } from './http/register-routers.js';
import { registerAuditHooks } from './http/audit-hooks.js';

import { loadEnv } from './config/env.js';
import { apiErrorHandler } from './http/error-handler.js';

// Não expor o token de convite em logs (ele vai no caminho da URL).
function safeUrl(url: string): string {
    return url.startsWith('/invites/') ? '/invites/[redacted]' : url;
}
import { createPrismaClient } from './lib/prisma.js';

const server = fastify({
    // Em produção a API só é acessível pelo proxy do Coolify (um salto): sem isto
    // request.ip é o do proxy e o limite de tentativas de login vale para todos.
    trustProxy: 1,
    logger: true,
    disableRequestLogging: true,
    ajv: {
        customOptions: {
            keywords: ['example'],
        },
    },
});

server.addHook('onRequest', (request, _reply, done) => {
    request.log.info(
        { method: request.method,
url: safeUrl(request.url),
remoteAddress: request.ip },
        'incoming request',
    );
    done();
});

server.addHook('onResponse', (request, reply, done) => {
    request.log.info(
        {
            method: request.method,
            url: safeUrl(request.url),
            statusCode: reply.statusCode,
            responseTime: reply.elapsedTime,
        },
        'request completed',
    );
    done();
});

server.register(swagger, {
    openapi: {
        openapi: '3.0.0',
        info: {
            title: 'Sindicato Rural API',
            description:
                'API para gerenciamento de usuários, cursos e regras de permissão do Sindicato Rural',
            version: '1.0.0',
        },
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                },
            },
        },
    },
});

// Swagger UI expõe o mapa completo da API publicamente. Em produção só habilita
// via ENABLE_DOCS=true (evita entregar o mapa a qualquer visitante).
if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_DOCS === 'true') {
    server.register(swaggerUi, {
        routePrefix: '/docs',
        uiConfig: {
            docExpansion: 'list',
            deepLinking: true,
        },
    });
}

server.addContentTypeParser('application/json', { parseAs: 'string' }, function (_req, body, done) {
    if (body === '' || body === null || body === undefined) {
        done(null, {});
        return;
    }
    try {
        done(null, JSON.parse(body as string));
    } catch (err) {
        done(err as Error, undefined);
    }
});

// Sem `limits`, o @fastify/multipart usa o bodyLimit padrão do Fastify (1MB),
// que rejeita (413) avatares/banners/fichas reais. 15MB cobre a ficha escaneada
// (usecase valida 15MB) e imagens (~5MB, redimensionadas depois).
server.register(multipart, { limits: { fileSize: 15 * 1024 * 1024 } });

const env = loadEnv();
const prisma = createPrismaClient(env);

registerAuditHooks(server, prisma);

server.register(cors, {
    origin: env.CORS_ORIGIN === '*'
        ? true
        : env.CORS_ORIGIN.split(',').map(o => o.trim()),
    // Nunca combinar credentials com origin curinga (reflete qualquer origem).
    credentials: env.CORS_ORIGIN !== '*',
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
});

// Rate limit global por IP (barra spam/brute-force). Rotas sensíveis (login)
// definem um limite mais estrito via `config.rateLimit` na própria rota.
server.register(rateLimit, {
    global: true,
    max: 200,
    timeWindow: '1 minute',
});

registerRouters(server, prisma);

server.get(
    '/',
    {
        schema: {
            tags: ['Health'],
            summary: 'Health check',
            response: {
                200: {
                    type: 'object',
                    properties: {
                        status: { type: 'string' },
                        uptime: { type: 'number' },
                    },
                },
            },
        },
    },
    async () => ({
        status: 'ok',
        uptime: process.uptime(),
    }),
);

server.setErrorHandler(apiErrorHandler);

server.listen({ port: env.PORT,
host: '0.0.0.0' }, (err, address) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    console.log(`Server listening at ${address}`);
});

