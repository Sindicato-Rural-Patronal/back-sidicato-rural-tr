import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client/extension';
import { DashboardStatsController } from '../controllers/dashboard-stats.js';
import { DashboardStatsUseCase } from '../../usecase/dashboard-stats.js';
import { createCourseAdapter } from '../../adapter/database/course-adapter.js';
import { createUserDataAdapter } from '../../adapter/database/user-data.js';
import { createUserAdminAdapter } from '../../adapter/database/user-admin-adapter.js';
import { createRuleAdapter } from '../../adapter/database/rule-adapter.js';
import { createRegistrationAdapter } from '../../adapter/database/registration-adapter.js';
import { createRoomAdapter } from '../../adapter/database/room-adapter.js';
import { createContactMessageAdapter } from '../../adapter/database/contact-message-adapter.js';
import { createDashboardAdapter } from '../../adapter/database/dashboard-adapter.js';
import { createPendingNotificationsAdapter } from '../../adapter/database/pending-notifications-adapter.js';
import { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { errorResponse } from '../lib/swagger-schemas.js';

const int = { type: 'integer' };

// fast-json-stringify descarta campo não declarado: tudo o que sai está aqui.
// Cada bloco só vem quando a regra do admin tem a permissão correspondente.
const statsResponse = {
    type: 'object',
    properties: {
        courses: {
            type: 'object',
            properties: {
                total: int,
                public: int,
                private: int,
                unpublished: int,
                inProgress: int,
                completed: int,
            },
        },
        totalRooms: int,
        registrations: {
            type: 'object',
            properties: { last30Days: int,
pendingConfirmation: int },
        },
        coursesStartingIn7Days: int,
        totalRegistrations: int,
        registrationsLast30Days: int,
        totalUsers: int,
        membershipsExpiring30Days: int,
        totalAdmins: int,
        unreadMessages: int,
        quotesToday: {
            type: 'object',
            properties: {
                launched: { type: 'boolean' },
                // MORNING | AFTERNOON | null
                period: { type: 'string',
nullable: true },
            },
        },
    },
};

export async function dashboardRouter(fastify: FastifyInstance, prisma: PrismaClient) {
    const userAdminRepository = createUserAdminAdapter(prisma);
    const getAdminPermissions = new GetAdminPermissionsUseCase(
        userAdminRepository,
        createRuleAdapter(prisma),
    );

    const dashboardStatsController = new DashboardStatsController(
        new DashboardStatsUseCase(
            createCourseAdapter(prisma),
            createUserDataAdapter(prisma),
            userAdminRepository,
            createRegistrationAdapter(prisma),
            createRoomAdapter(prisma),
            createContactMessageAdapter(prisma),
            createDashboardAdapter(prisma),
            createPendingNotificationsAdapter(prisma),
        ),
        getAdminPermissions,
    );

    fastify.get(
        '/admin/dashboard/stats',
        {
            schema: {
                tags: ['Admin — Dashboard'],
                summary: 'Números do Painel Geral',
                description: `Qualquer admin logado. Cada bloco só vem quando a regra do admin permite ver o assunto — o que ele não pode ver é **omitido** da resposta (não dá 403).

**\`READ_COURSE\`**
- \`courses\` — total e por status (\`public\`, \`private\`, \`unpublished\`, \`inProgress\`, \`completed\`)
- \`totalRooms\` — salas cadastradas
- \`registrations.last30Days\` — inscrições dos últimos 30 dias
- \`registrations.pendingConfirmation\` — **todas** as inscrições ativas sem confirmar em cursos que ainda não terminaram (dia de Brasília). É de propósito mais amplo que o aviso do sino, que só olha os cursos de amanhã até +7 dias
- \`coursesStartingIn7Days\` — cursos PUBLIC/PRIVATE que começam de hoje até hoje + 7 (inclusive)
- \`totalRegistrations\` e \`registrationsLast30Days\` — nomes antigos, mantidos para não quebrar o painel

**\`READ_USER\`**
- \`totalUsers\` — **todas as pessoas ativas do cadastro** (não é o número de associados: inclui alunos, inscritos em curso e afins)
- \`membershipsExpiring30Days\` — associados ativos (memberStatus ACTIVE) com validade de hoje até hoje + 30, inclusive — a mesma consulta do sino

**\`READ_USER_ADMIN\`**: \`totalAdmins\` (contas de acesso ao painel) · **\`READ_CONTACT\`**: \`unreadMessages\` (mensagens de contato não lidas)

**\`READ_MARKET_QUOTE\`**: \`quotesToday\` — \`{ launched, period }\`: se já houve lançamento hoje (Brasília) e qual foi o último período (\`MORNING\`/\`AFTERNOON\`, null quando nada foi lançado). É o fato puro: a regra de quando cobrar (dias úteis, a partir das 11h) fica no sino.`,
                security: [{ bearerAuth: [] }],
                response: {
                    200: statsResponse,
                    401: errorResponse,
                },
            },
        },
        (req: FastifyRequest, res: FastifyReply) => dashboardStatsController.handle(req, res),
    );
}
