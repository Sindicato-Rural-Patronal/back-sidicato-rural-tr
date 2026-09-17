import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client/extension';
import { userDataRouter } from './router/user-data-router.js';
import { authRouter } from './router/auth-router.js';
import { userAdminRouter } from './router/user-admin.js';
import { courseRouter } from './router/course-router.js';
import { ruleRouter } from './router/rule-router.js';
import { roomRouter } from './router/room-router.js';
import { dashboardRouter } from './router/dashboard-router.js';
import { registrationRouter } from './router/registration-router.js';
import { newsRouter } from './router/news-router.js';
import { addressRouter } from './router/address-router.js';
import { instructorRouter } from './router/instructor-router.js';
import { contactRouter } from './router/contact-router.js';
import { bannerRouter } from './router/banner-router.js';
import { userRelationRouter } from './router/user-relation-router.js';
import { userPropertyRouter } from './router/user-property-router.js';
import { marketQuoteRouter } from './router/market-quote-router.js';
import { auditRouter } from './router/audit-router.js';
import { adminInviteRouter } from './router/admin-invite-router.js';
import { financeRouter } from './router/finance-router.js';
import { unimedRouter } from './router/unimed-router.js';
import { siteSettingsRouter } from './router/site-settings-router.js';
import { convenioRouter } from './router/convenio-router.js';
import { companyRouter } from './router/company-router.js';
import { galleryRouter } from './router/gallery-router.js';
import { publicContactRouter } from './router/public-contact-router.js';

// Todas as rotas da API. Usado pelo servidor e pelos testes E2E, para os dois
// não ficarem com conjuntos diferentes de rotas.
export function registerRouters(app: FastifyInstance, prisma: PrismaClient) {
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
    app.register(userRelationRouter, prisma);
    app.register(userPropertyRouter, prisma);
    app.register(marketQuoteRouter, prisma);
    app.register(auditRouter, prisma);
    app.register(adminInviteRouter, prisma);
    app.register(financeRouter, prisma);
    app.register(unimedRouter, prisma);
    app.register(siteSettingsRouter, prisma);
    app.register(convenioRouter, prisma);
    app.register(companyRouter, prisma);
    app.register(galleryRouter, prisma);
    app.register(publicContactRouter, prisma);
}
