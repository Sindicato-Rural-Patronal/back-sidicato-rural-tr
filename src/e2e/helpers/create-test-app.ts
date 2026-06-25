import fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { userDataRouter } from '../../http/router/user-data-router.js';
import { authRouter } from '../../http/router/auth-router.js';
import { userAdminRouter } from '../../http/router/user-admin.js';
import { courseRouter } from '../../http/router/course-router.js';
import { ruleRouter } from '../../http/router/rule-router.js';
import { roomRouter } from '../../http/router/room-router.js';
import { dashboardRouter } from '../../http/router/dashboard-router.js';
import { registrationRouter } from '../../http/router/registration-router.js';
import { newsRouter } from '../../http/router/news-router.js';
import { addressRouter } from '../../http/router/address-router.js';
import { instructorRouter } from '../../http/router/instructor-router.js';
import { contactRouter } from '../../http/router/contact-router.js';
import { bannerRouter } from '../../http/router/banner-router.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { FastifyInstance } from 'fastify';

export async function createTestApp(prisma: PrismaClient): Promise<FastifyInstance> {
    const app = fastify({ logger: false });

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

    app.register(userDataRouter, prisma);
    app.register(authRouter, prisma);
    app.register(userAdminRouter, prisma);
    app.register(courseRouter, prisma);
    app.register(roomRouter, prisma);
    app.register(ruleRouter, prisma);
    app.register(dashboardRouter, prisma);
    app.register(registrationRouter, prisma);
    app.register(newsRouter, prisma);
    app.register(addressRouter, prisma);
    app.register(instructorRouter, prisma);
    app.register(contactRouter, prisma);
    app.register(bannerRouter, prisma);

    await app.ready();
    return app;
}
