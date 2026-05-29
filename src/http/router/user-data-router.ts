import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { CreateUserController } from "../controllers/create-user.js";
import { CreateUserUseCase } from "../../usecase/create-user-data.js";
import { createUserDataAdapter } from "../../adapter/database/user-data.js";
import type { PrismaClient } from "@prisma/client/extension";
import { ListUsersController } from "../controllers/list-users.js";
import { ListUsersUseCase } from "../../usecase/list-users.js";
import { createUserAdminAdapter } from "../../adapter/database/user-admin-adapter.js";
import { createRuleAdapter } from "../../adapter/database/rule-adapter.js";

export async function userDataRouter(fastify: FastifyInstance, prisma: PrismaClient) {
    const userRepository = createUserDataAdapter(prisma);
    const userAdminRepository = createUserAdminAdapter(prisma);
    const ruleRepository = createRuleAdapter(prisma);
    const createUserController = new CreateUserController(new CreateUserUseCase(userRepository));
    const listUsersController = new ListUsersController(new ListUsersUseCase(userRepository, userAdminRepository, ruleRepository));

    fastify.get('/admin/users', {
        schema: {
            tags: ['Admin — Users'],
            summary: 'List workers (internal)',
            description: `Returns all registered UserData. Requires JWT token with \`READ_USER\` permission.

**Business rules:**
- Returns all rural workers — use in the member management panel
- Includes sensitive fields (CPF, CNPJ) — do not expose publicly
- Does not include passwords or admin access data`,
            security: [{ bearerAuth: [] }],
            response: {
                200: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'string' },
                            name: { type: 'string' },
                            email: { type: 'string' },
                            phone: { type: 'string' },
                            cpf: { type: 'string', nullable: true },
                            cnpj: { type: 'string', nullable: true },
                            avatar: { type: 'string', nullable: true },
                            createdAt: { type: 'string' },
                            updatedAt: { type: 'string' },
                        },
                    },
                },
                403: { type: 'object', properties: { error: { type: 'string' } } },
            },
        },
    }, (req: FastifyRequest, res: FastifyReply) => listUsersController.handle(req, res));

    fastify.post('/users', {
        schema: {
            tags: ['Users'],
            summary: 'Create worker user',
            description: `Creates a new UserData (rural worker). Public route — no authentication required.

**Business rules:**
- \`email\` and \`cpf\` must be unique in the system — returns 409 if already registered
- This record represents the rural worker; to have admin access, a \`UserAdmin\` linked to this record must be created (via \`POST /admin/users\`)
- The \`cnpj\` field is optional (for legal-entity rural producers)`,
            body: {
                type: 'object',
                required: ['name', 'email', 'phone', 'cpf'],
                properties: {
                    name: { type: 'string' },
                    email: { type: 'string', format: 'email' },
                    phone: { type: 'string' },
                    cpf: { type: 'string' },
                },
            },
            response: {
                201: {
                    description: 'User created successfully',
                    type: 'object',
                    properties: {
                        id: { type: 'string' },
                        name: { type: 'string' },
                        email: { type: 'string' },
                        phone: { type: 'string' },
                        cpf: { type: 'string' },
                        createdAt: { type: 'string', format: 'date-time' },
                    },
                },
                409: {
                    description: 'Email or phone already registered',
                    type: 'object',
                    properties: { error: { type: 'string' } },
                },
                500: {
                    description: 'Internal error creating user',
                    type: 'object',
                    properties: { error: { type: 'string' } },
                },
            },
        },
    }, (req: FastifyRequest, res: FastifyReply) => createUserController.handle(req, res));
}
