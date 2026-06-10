import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client/extension';
import { LoginUserAdminController } from '../controllers/login-user-admin.js';
import { LoginUserAdminUseCase } from '../../usecase/login-user-admin.js';
import { createUserAdminAdapter } from '../../adapter/database/user-admin-adapter.js';

export async function authRouter(fastify: FastifyInstance, prisma: PrismaClient) {
    const userAdminRepository = createUserAdminAdapter(prisma);
    const loginController = new LoginUserAdminController(
        new LoginUserAdminUseCase(userAdminRepository),
    );

    fastify.post(
        '/auth/login',
        {
            schema: {
                tags: ['Auth'],
                summary: 'Admin login',
                description: `Authenticates an admin user and returns a JWT Bearer token valid for **1 hour**.

**Business rules:**
- Only users registered in \`UserAdmin\` can log in (regular workers do not have access)
- The returned token must be sent in the \`Authorization: Bearer <token>\` header on all protected routes
- After 1 hour the token expires and a new login is required
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
                    200: {
                        description: 'Login successful',
                        type: 'object',
                        properties: {
                            token: { type: 'string',
description: 'JWT Bearer token' },
                        },
                    },
                    401: {
                        description: 'Invalid credentials',
                        type: 'object',
                        properties: { error: { type: 'string' } },
                    },
                },
            },
        },
        (req: FastifyRequest, res: FastifyReply) => loginController.handle(req, res),
    );
}
