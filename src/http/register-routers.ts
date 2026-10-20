import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '../generated/prisma/client.js';
import { userDataRouter } from './router/user-data-router.js';
import { authRouter } from './router/auth-router.js';
import { userAdminRouter } from './router/user-admin.js';
import { userMergeRouter } from './router/user-merge-router.js';
import { courseRouter } from './router/course-router.js';
import { ruleRouter } from './router/rule-router.js';
import { roomRouter } from './router/room-router.js';
import { roomBookingRouter } from './router/room-booking-router.js';
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
import { exportRouter } from './router/export-router.js';
import { notificationRouter } from './router/notification-router.js';
import { healthRouter } from './router/health-router.js';
import { createUserAdminAdapter } from '../adapter/database/user-admin-adapter.js';
import { createRuleAdapter } from '../adapter/database/rule-adapter.js';
import { GetAdminPermissionsUseCase } from '../usecase/get-admin-permissions.js';
import { withRouteAuth, type RouteAuthEntry } from './lib/route-auth.js';

// Todas as rotas da API. Usado pelo servidor e pelos testes E2E, para os dois
// não ficarem com conjuntos diferentes de rotas. Ficam dentro do plugin da
// autorização por rota (`lib/route-auth.ts`); `inventory` recebe a declaração
// de cada rota, para os testes.
export function registerRouters(app: FastifyInstance, prisma: PrismaClient, inventory?: RouteAuthEntry[]) {
    const getAdminPermissions = new GetAdminPermissionsUseCase(createUserAdminAdapter(prisma), createRuleAdapter(prisma));
    withRouteAuth(app, getAdminPermissions, api => {
        api.register(userDataRouter, prisma);
        api.register(authRouter, prisma);
        api.register(userAdminRouter, prisma);
        api.register(userMergeRouter, prisma);
        api.register(courseRouter, prisma);
        api.register(roomRouter, prisma);
        api.register(roomBookingRouter, prisma);
        api.register(ruleRouter, prisma);
        api.register(dashboardRouter, prisma);
        api.register(registrationRouter, prisma);
        api.register(newsRouter, prisma);
        api.register(addressRouter, prisma);
        api.register(instructorRouter, prisma);
        api.register(contactRouter, prisma);
        api.register(bannerRouter, prisma);
        api.register(userRelationRouter, prisma);
        api.register(userPropertyRouter, prisma);
        api.register(marketQuoteRouter, prisma);
        api.register(auditRouter, prisma);
        api.register(adminInviteRouter, prisma);
        api.register(financeRouter, prisma);
        api.register(unimedRouter, prisma);
        api.register(siteSettingsRouter, prisma);
        api.register(convenioRouter, prisma);
        api.register(companyRouter, prisma);
        api.register(galleryRouter, prisma);
        api.register(publicContactRouter, prisma);
        api.register(exportRouter, prisma);
        api.register(notificationRouter, prisma);
        api.register(healthRouter);
    }, { inventory });
}
