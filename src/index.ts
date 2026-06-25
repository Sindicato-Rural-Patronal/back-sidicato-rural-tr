import fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import metrics from 'fastify-metrics';
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

import { loadEnv } from './config/env.js';
import { createPrismaClient } from './lib/prisma.js';
import type { Permission } from './generated/prisma/enums.js';
import { hash } from 'bcrypt';

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

server.register(metrics, {
    endpoint: '/metrics',
    routeMetrics: {
        enabled: true,
        registeredRoutesOnly: false,
        groupStatusCodes: false,
        overrides: {
            histogram: {
                name: 'http_request_duration_seconds',
                buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
            },
            summary: {
                name: 'http_request_summary_seconds',
            },
        },
    },
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

server.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
        docExpansion: 'list',
        deepLinking: true,
    },
});

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

server.register(multipart);

const env = loadEnv();
const prisma = createPrismaClient(env);

server.register(cors, {
    origin: env.CORS_ORIGIN === '*'
        ? true
        : env.CORS_ORIGIN.split(',').map(o => o.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
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
    if (existingAdmin) {
        console.log('Admin user already exists');
        console.log('First initialization completed');
        return;
    }

    const firstUser = await prisma.userAdmin.create({
        data: {
            username: 'admin',
            passwordHash: await hash('admin', 10),
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
