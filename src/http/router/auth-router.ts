import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client/extension';
import { LoginUserAdminController } from '../controllers/login-user-admin.js';
import { RefreshAdminTokenController } from '../controllers/refresh-admin-token.js';
import { LoginUserAdminUseCase } from '../../usecase/login-user-admin.js';
import { RefreshAdminTokenUseCase } from '../../usecase/refresh-admin-token.js';
import { createUserAdminAdapter } from '../../adapter/database/user-admin-adapter.js';
import { createRuleAdapter } from '../../adapter/database/rule-adapter.js';

// Limite estrito contra brute-force de senha (bem abaixo do global). A renovação
// usa o mesmo: o painel renova no máximo algumas vezes por turno.
const authRateLimit = {
    rateLimit: {
        max: 10,
        timeWindow: '5 minutes',
    },
};

const tokenResponse = (description: string) => ({
    description,
    type: 'object',
    properties: {
        token: {
            type: 'string',
            description: 'JWT Bearer token',
        },
    },
});

const errorBody = (description: string) => ({
    description,
    type: 'object',
    properties: { error: { type: 'string' } },
});

export async function authRouter(fastify: FastifyInstance, prisma: PrismaClient) {
    const userAdminRepository = createUserAdminAdapter(prisma);
    const loginController = new LoginUserAdminController(
        new LoginUserAdminUseCase(userAdminRepository),
    );
    const refreshController = new RefreshAdminTokenController(
        new RefreshAdminTokenUseCase(userAdminRepository, createRuleAdapter(prisma)),
    );

    fastify.post(
        '/auth/login',
        {
            // Conta a tentativa depois de ler o corpo (preValidation, não onRequest):
            // o bloqueio (429) entra na auditoria com o usuário digitado.
            config: { rateLimit: { ...authRateLimit.rateLimit,
hook: 'preValidation' as const } },
            bodyLimit: 2048,
            schema: {
                tags: ['Auth'],
                summary: 'Admin login',
                description: `Authenticates an admin user and returns a JWT Bearer token valid for **8 hours**.

**Business rules:**
- Only users registered in \`UserAdmin\` can log in (regular workers do not have access)
- The returned token must be sent in the \`Authorization: Bearer <token>\` header on all protected routes
- While the token is still valid it can be renewed with \`POST /auth/refresh\`; after 8 hours without renewal it expires and a new login is required
- Admin permissions are determined by the \`Rule\` associated with their account`,
                body: {
                    type: 'object',
                    required: ['username', 'password'],
                    properties: {
                        username: { type: 'string' },
                        password: { type: 'string' },
                    },
                },
                response: {
                    200: tokenResponse('Login successful'),
                    401: errorBody('Invalid credentials'),
                },
            },
        },
        (req: FastifyRequest, res: FastifyReply) => loginController.handle(req, res),
    );

    fastify.post(
        '/auth/refresh',
        {
            config: authRateLimit,
            schema: {
                tags: ['Auth'],
                summary: 'Renew admin token',
                description: `Exchanges a still-valid admin token for a new one valid for **8 hours** (same payload as \`/auth/login\`).

**Business rules:**
- Send the current token in the \`Authorization: Bearer <token>\` header (no body)
- An expired or invalid token, or an admin that was removed (or has no rule), gets \`401\` — a new login is required
- The admin panel calls this automatically while in use, so an active session does not expire`,
                security: [{ bearerAuth: [] }],
                response: {
                    200: tokenResponse('Token renewed'),
                    401: errorBody('Invalid or expired token, or admin not found'),
                },
            },
        },
        (req: FastifyRequest, res: FastifyReply) => refreshController.handle(req, res),
    );
}
