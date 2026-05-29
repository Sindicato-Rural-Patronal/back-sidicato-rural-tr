import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client/extension';
import { DashboardStatsController } from '../controllers/dashboard-stats.js';
import { DashboardStatsUseCase } from '../../usecase/dashboard-stats.js';
import { createCourseAdapter } from '../../adapter/database/course-adapter.js';
import { createUserDataAdapter } from '../../adapter/database/user-data.js';
import { createUserAdminAdapter } from '../../adapter/database/user-admin-adapter.js';
import { createRuleAdapter } from '../../adapter/database/rule-adapter.js';

export async function dashboardRouter(fastify: FastifyInstance, prisma: PrismaClient) {
    const courseRepository = createCourseAdapter(prisma);
    const userDataRepository = createUserDataAdapter(prisma);
    const userAdminRepository = createUserAdminAdapter(prisma);
    const ruleRepository = createRuleAdapter(prisma);

    const dashboardStatsController = new DashboardStatsController(
        new DashboardStatsUseCase(courseRepository, userDataRepository, userAdminRepository, ruleRepository)
    );

    fastify.get('/admin/dashboard/stats', {
        schema: {
            tags: ['Admin — Dashboard'],
            summary: 'Admin panel statistics',
            description: `Returns general counts and metrics for the system. Requires JWT token with \`READ_COURSE\` permission.

**Returned data:**
- \`totalUsers\` — total registered workers (UserData)
- \`totalAdmins\` — total registered admins (UserAdmin)
- \`courses.total\` — total courses
- \`courses.public\` — courses with status \`PUBLICO\`
- \`courses.private\` — courses with status \`PRIVADO\`
- \`courses.unpublished\` — courses with status \`NAO_PUBLICADO\`
- \`totalRegistrations\` — total course registrations`,
            security: [{ bearerAuth: [] }],
            response: {
                200: {
                    type: 'object',
                    properties: {
                        totalUsers: { type: 'integer' },
                        totalAdmins: { type: 'integer' },
                        courses: {
                            type: 'object',
                            properties: {
                                total: { type: 'integer' },
                                public: { type: 'integer' },
                                private: { type: 'integer' },
                                unpublished: { type: 'integer' },
                            },
                        },
                        totalRegistrations: { type: 'integer' },
                    },
                },
                403: { type: 'object', properties: { error: { type: 'string' } } },
            },
        },
    }, (req: FastifyRequest, res: FastifyReply) => dashboardStatsController.handle(req, res));
}
