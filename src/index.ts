import fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { userDataRouter } from './http/router/user-data-router.js';
import { authRouter } from './http/router/auth-router.js';
import { userAdminRouter } from './http/router/user-admin.js';
import { courseRouter } from './http/router/course-router.js';
import { ruleRouter } from './http/router/rule-router.js';
import { roomRouter } from './http/router/room-router.js';
import { dashboardRouter } from './http/router/dashboard-router.js';
import { registrationRouter } from './http/router/registration-router.js';
import { newsRouter } from './http/router/news-router.js';
import { addressRouter } from './http/router/address-router.js';
import { instructorRouter } from './http/router/instructor-router.js';
import { contactRouter } from './http/router/contact-router.js';
import { bannerRouter } from './http/router/banner-router.js';
import { userRelationRouter } from './http/router/user-relation-router.js';
import { userPropertyRouter } from './http/router/user-property-router.js';
import { marketQuoteRouter } from './http/router/market-quote-router.js';
import { auditRouter } from './http/router/audit-router.js';
import { adminInviteRouter } from './http/router/admin-invite-router.js';
import { decodeToken } from './lib/auth.js';
import { deriveAuditEntity } from './lib/audit-entity.js';
import { lookupTargetLabel, bodyLabel } from './lib/audit-label.js';

import { loadEnv } from './config/env.js';
import { isPrismaUniqueViolation } from './lib/prisma-errors.js';
import { hash } from 'bcrypt';
import { createPrismaClient } from './lib/prisma.js';

const server = fastify({
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
url: request.url,
remoteAddress: request.ip },
        'incoming request',
    );
    done();
});

server.addHook('onResponse', (request, reply, done) => {
    request.log.info(
        {
            method: request.method,
            url: request.url,
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

// Antes de editar/excluir, captura o nome do alvo (some depois numa exclusão).
server.addHook('preHandler', async request => {
    const m = request.method;
    if (m !== 'PATCH' && m !== 'PUT' && m !== 'DELETE') return;
    const path = (request.url ?? '').split('?')[0];
    try {
        (request as { _auditLabel?: string | null })._auditLabel = await lookupTargetLabel(
            prisma,
            path,
        );
    } catch {
        /* auditoria nunca deve derrubar a request */
    }
});

// Trilha de auditoria: registra mutações bem-sucedidas (quem/o quê/quando).
// Roda após a resposta ser enviada — nunca atrasa nem quebra a request.
server.addHook('onResponse', async (request, reply) => {
    const method = request.method;
    if (method !== 'POST' && method !== 'PATCH' && method !== 'PUT' && method !== 'DELETE') return;
    if (reply.statusCode >= 400) return;
    const path = (request.url ?? '').split('?')[0];
    if (path === '/auth/login') return; // ruído + sem ator
    try {
        const token = request.headers['authorization']?.replace('Bearer ', '') ?? '';
        const decoded = decodeToken(token);
        const stashed = (request as { _auditLabel?: string | null })._auditLabel ?? null;
        const targetLabel = stashed ?? bodyLabel(request.body);
        await prisma.auditLog.create({
            data: {
                actorId: decoded?.userId ?? null,
                method,
                path,
                entity: deriveAuditEntity(path),
                targetLabel,
                statusCode: reply.statusCode,
            },
        });
    } catch {
        /* auditoria nunca deve derrubar a aplicação */
    }
});

server.register(cors, {
    origin: env.CORS_ORIGIN === '*'
        ? true
        : env.CORS_ORIGIN.split(',').map(o => o.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
});

// Rate limit global por IP (barra spam/brute-force). Rotas sensíveis (login)
// definem um limite mais estrito via `config.rateLimit` na própria rota.
server.register(rateLimit, {
    global: true,
    max: 200,
    timeWindow: '1 minute',
});


await bootstrapAdmin();

server.register(userDataRouter, prisma);
server.register(authRouter, prisma);
server.register(userAdminRouter, prisma);
server.register(courseRouter, prisma);
server.register(roomRouter, prisma);
server.register(ruleRouter, prisma);
server.register(dashboardRouter, prisma);
server.register(registrationRouter, prisma);
server.register(newsRouter, prisma);
server.register(addressRouter, prisma);
server.register(instructorRouter, prisma);
server.register(contactRouter, prisma);
server.register(bannerRouter, prisma);
server.register(userRelationRouter, prisma);
server.register(userPropertyRouter, prisma);
server.register(marketQuoteRouter, prisma);
server.register(auditRouter, prisma);
server.register(adminInviteRouter, prisma);

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

// Rede de segurança para erros não tratados: mapeia P2002 (unicidade) para 409
// e nunca vaza stack/detalhe interno num 500.
server.setErrorHandler(
    (error: Error & { validation?: unknown; statusCode?: number }, request, reply) => {
        if (error.validation) {
            return reply.status(400).send({ error: error.message });
        }
        if (isPrismaUniqueViolation(error)) {
            return reply.status(409).send({ error: 'Registro já existe (dados únicos em conflito).' });
        }
        const status = error.statusCode ?? 500;
        if (status >= 500) {
            request.log.error(error);
            return reply.status(500).send({ error: 'Erro interno do servidor.' });
        }
        return reply.status(status).send({ error: error.message });
    },
);

server.listen({ port: env.PORT,
host: '0.0.0.0' }, (err, address) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    console.log(`Server listening at ${address}`);
});

// TEMPORÁRIO (recuperação de acesso): cria um admin a partir de env
// (BOOTSTRAP_ADMIN_USERNAME / BOOTSTRAP_ADMIN_PASSWORD, opcional _EMAIL) se ele
// ainda não existir, com a rule mais completa. Idempotente e inerte sem as env.
// Remover após o acesso ser restabelecido.
async function bootstrapAdmin() {
    const username = process.env.BOOTSTRAP_ADMIN_USERNAME;
    const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
    if (!username || !password) return;
    try {
        const existing = await prisma.userAdmin.findFirst({ where: { username } });
        if (existing) {
            console.log(`[bootstrap] admin "${username}" já existe — nada a fazer`);
            return;
        }
        const rules = await prisma.rule.findMany();
        if (rules.length === 0) {
            console.warn('[bootstrap] nenhuma rule cadastrada — não é possível criar admin');
            return;
        }
        const rule = rules.reduce((a, b) =>
            (b.permissions?.length ?? 0) > (a.permissions?.length ?? 0) ? b : a);
        const email = process.env.BOOTSTRAP_ADMIN_EMAIL || `${username}@bootstrap.local`;
        let userData = await prisma.userData.findUnique({ where: { email } });
        if (!userData) {
            userData = await prisma.userData.create({ data: { name: username,
email,
phone: '' } });
        }
        const linked = await prisma.userAdmin.findFirst({ where: { userDataId: userData.id } });
        if (linked) {
            console.warn('[bootstrap] userData já vinculado a um admin — abortando');
            return;
        }
        await prisma.userAdmin.create({
            data: {
                username,
                passwordHash: await hash(password, 10),
                userDataId: userData.id,
                rulesId: rule.id,
            },
        });
        console.log(
            `[bootstrap] admin "${username}" criado com a rule "${rule.name}" (${rule.permissions.length} perms)`,
        );
    } catch (e) {
        console.error('[bootstrap] falhou:', e);
    }
}

