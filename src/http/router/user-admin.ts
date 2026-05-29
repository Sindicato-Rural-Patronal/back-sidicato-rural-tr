import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { PrismaClient } from "@prisma/client/extension";
import { CreateUserAdminController } from "../controllers/create-user-admin.js";
import { CreateUserAdminUseCase } from "../../usecase/create-user-admin.js";
import { createUserAdminAdapter } from "../../adapter/database/user-admin-adapter.js";
import { createUserDataAdapter } from "../../adapter/database/user-data.js";
import { createRuleAdapter } from "../../adapter/database/rule-adapter.js";
import { ListUserAdminsController } from "../controllers/list-user-admins.js";
import { ListUserAdminsUseCase } from "../../usecase/list-user-admins.js";

export async function userAdminRouter(fastify: FastifyInstance, prisma: PrismaClient) {
    const userAdminRepository = createUserAdminAdapter(prisma);
    const userDataRepository = createUserDataAdapter(prisma);
    const ruleRepository = createRuleAdapter(prisma);

    const createUserAdminController = new CreateUserAdminController(
        new CreateUserAdminUseCase(userAdminRepository, userDataRepository, ruleRepository)
    );
    const listUserAdminsController = new ListUserAdminsController(new ListUserAdminsUseCase(userAdminRepository, ruleRepository));

    fastify.get('/admin/users/admins', {
        schema: {
            tags: ['Admin — Users'],
            summary: 'List admin users (internal)',
            description: `Returns all UserAdmin records with worker data and associated rule. Requires JWT token with \`READ_USER_ADMIN\` permission.

**Business rules:**
- Returns the \`passwordHash\` field — **do not display on frontend**; filter client-side if needed
- Each item includes \`userData\` (name, email, CPF) and \`rules\` (name, permission list)
- Use to manage who has admin access and what permissions each one holds`,
            security: [{ bearerAuth: [] }],
            response: {
                200: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'string' },
                            username: { type: 'string' },
                            userDataId: { type: 'string' },
                            rulesId: { type: 'string' },
                            createdAt: { type: 'string' },
                            updatedAt: { type: 'string' },
                            userData: {
                                type: 'object',
                                properties: {
                                    name: { type: 'string' },
                                    email: { type: 'string' },
                                    cpf: { type: 'string', nullable: true },
                                },
                            },
                            rules: {
                                type: 'object',
                                properties: {
                                    name: { type: 'string' },
                                    permitions: { type: 'array', items: { type: 'string' } },
                                },
                            },
                        },
                    },
                },
                403: { type: 'object', properties: { error: { type: 'string' } } },
            },
        },
    }, (req: FastifyRequest, res: FastifyReply) => listUserAdminsController.handle(req, res));

    fastify.post('/admin/users', {
        schema: {
            tags: ['Admin — Users'],
            summary: 'Create admin user',
            description: `Creates a new UserAdmin linked to an existing UserData. Requires JWT token with \`CREATE_USER_ADMIN\` permission.

**Business rules:**
- \`userDataId\` must point to an already registered UserData — the admin always represents a real worker
- A UserData can only have one linked UserAdmin (1:1 relationship)
- \`username\` must be unique in the system
- \`userRole\` is the ID of an existing \`Rule\` — that Rule defines what permissions the new admin will have
- To get available Rule IDs, use \`GET /admin/rules\`
- Passwords are stored as bcrypt hash — never in plain text`,
            security: [{ bearerAuth: [] }],
            body: {
                type: 'object',
                required: ['username', 'password', 'userDataId', 'userRole'],
                properties: {
                    username: { type: 'string' },
                    password: { type: 'string' },
                    userDataId: { type: 'string', description: 'ID of an existing UserData' },
                    userRole: { type: 'string', description: 'ID of the Rule to assign to the admin' },
                },
            },
            response: {
                201: {
                    description: 'Admin created successfully',
                    type: 'object',
                    properties: {
                        userAdminId: { type: 'string' },
                    },
                },
                400: {
                    description: 'Invalid data',
                    type: 'object',
                    properties: { error: { type: 'string' } },
                },
                401: {
                    description: 'Invalid or missing token',
                    type: 'object',
                    properties: { error: { type: 'string' } },
                },
                403: {
                    description: 'Missing CREATE_USER_ADMIN permission',
                    type: 'object',
                    properties: { error: { type: 'string' } },
                },
                409: {
                    description: 'Username or UserData already in use',
                    type: 'object',
                    properties: { error: { type: 'string' } },
                },
            },
        },
    }, (req: FastifyRequest, res: FastifyReply) => createUserAdminController.handle(req, res));
}
