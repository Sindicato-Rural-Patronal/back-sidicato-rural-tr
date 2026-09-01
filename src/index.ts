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
import { decodeToken } from './lib/auth.js';
import { deriveAuditEntity } from './lib/audit-entity.js';

import { loadEnv } from './config/env.js';
import { isPrismaUniqueViolation } from './lib/prisma-errors.js';
import { createPrismaClient } from './lib/prisma.js';
import type { Permission } from './generated/prisma/enums.js';
import { hash, compare } from 'bcrypt';

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
        await prisma.auditLog.create({
            data: {
                actorId: decoded?.userId ?? null,
                method,
                path,
                entity: deriveAuditEntity(path),
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

await firstInitialize();

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

async function firstInitialize() {
    console.log('Running first initialization...');

    let superRule = await prisma.rule.findFirst({ where: { name: 'SUPER_RULE' } });

    const ALL_PERMISSIONS = [
        'CREATE_USER',
        'UPDATE_USER',
        'DELETE_USER',
        'READ_USER',
        'CREATE_COURSE',
        'UPDATE_COURSE',
        'DELETE_COURSE',
        'READ_COURSE',
        'CREATE_RULE',
        'UPDATE_RULE',
        'DELETE_RULE',
        'READ_RULE',
        'CREATE_USER_ADMIN',
        'UPDATE_USER_ADMIN',
        'DELETE_USER_ADMIN',
        'READ_USER_ADMIN',
        'CREATE_NEWS',
        'UPDATE_NEWS',
        'DELETE_NEWS',
        'READ_NEWS',
        'READ_CONTACT',
        'UPDATE_CONTACT',
        'CREATE_BANNER',
        'UPDATE_BANNER',
        'DELETE_BANNER',
        'READ_BANNER',
    ] as Permission[];

    if (superRule) {
        const missingPerms = ALL_PERMISSIONS.filter(
            (p: string) => !(superRule!.permissions as string[]).includes(p),
        );
        if (missingPerms.length > 0) {
            await prisma.rule.update({
                where: { id: superRule.id },
                data: { permissions: ALL_PERMISSIONS },
            });
            superRule = await prisma.rule.findFirst({ where: { name: 'SUPER_RULE' } });
            console.log('SUPER_RULE updated with new permissions:', missingPerms);
        } else {
            console.log('SUPER_RULE already exists and is up to date');
        }
    } else {
        superRule = await prisma.rule.create({
            data: {
                name: 'SUPER_RULE',
                permissions: ALL_PERMISSIONS,
                description: 'Rule with all permissions for super admin users',
            },
        });
        console.log('SUPER_RULE created successfully');
    }

    if (!superRule?.id) {
        console.error('SUPER_RULE id not found');
        return;
    }

    let userData = {} as {
        name: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        email: string;
        phone: string;
        avatar: string | null;
        cpf: string | null;
        cnpj: string | null;
    } | null;

    const UserDataAlreadyExists = await prisma.userData.findUnique({
        where: { email: 'eduardofrnkdev@gmail.com' },
    });

    if (UserDataAlreadyExists) {
        console.log('First user data already exists');
        userData = UserDataAlreadyExists;
    } else {
        const firstUserData = await prisma.userData.create({
            data: {
                email: 'eduardofrnkdev@gmail.com',
                phone: '(44) 99840-0358',
                name: 'Eduardo Nakai',
                cpf: '069-496-759-92',
            },
        });
        if (firstUserData) {
            console.log('First user data created successfully');
            userData = firstUserData;
        } else {
            console.error('Failed to create first user data');
            return;
        }
    }

    const existingAdmin = await prisma.userAdmin.findUnique({
        where: { username: 'admin' },
    });

    // Senha inicial vem SEMPRE do ambiente — nunca semear com senha conhecida.
    const initialPassword = process.env.INITIAL_ADMIN_PASSWORD;

    if (existingAdmin) {
        // Remediação do default fraco: se a senha ainda é o antigo "admin" e há
        // uma INITIAL_ADMIN_PASSWORD configurada, rotaciona automaticamente.
        if (initialPassword && (await compare('admin', existingAdmin.passwordHash))) {
            await prisma.userAdmin.update({
                where: { id: existingAdmin.id },
                data: { passwordHash: await hash(initialPassword, 10) },
            });
            console.log('Default admin password rotated from INITIAL_ADMIN_PASSWORD');
        }
        console.log('Admin user already exists');
        console.log('First initialization completed');
        return;
    }

    if (!initialPassword) {
        console.warn(
            'INITIAL_ADMIN_PASSWORD not set — skipping admin seed. Set it to create the first admin.',
        );
        return;
    }

    const firstUser = await prisma.userAdmin.create({
        data: {
            username: 'admin',
            passwordHash: await hash(initialPassword, 10),
            userDataId: userData!.id,
            rulesId: superRule.id,
        },
    });
    if (firstUser) {
        console.log('First admin user created successfully');
        console.log('First initialization completed');
    } else {
        console.error('Failed to create first admin user');
    }
}
