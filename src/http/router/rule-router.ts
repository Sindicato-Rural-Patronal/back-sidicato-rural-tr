import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { PrismaClient } from "@prisma/client/extension";
import { CreateRuleController } from "../controllers/create-rule.js";
import { CreateRuleUseCase } from "../../usecase/create-rule.js";
import { UpdateRuleController } from "../controllers/update-rule.js";
import { UpdateRuleUseCase } from "../../usecase/update-rule.js";
import { createRuleAdapter } from "../../adapter/database/rule-adapter.js";
import { ListRulesController } from "../controllers/list-rules.js";
import { ListRulesUseCase } from "../../usecase/list-rules.js";
import { createUserAdminAdapter } from "../../adapter/database/user-admin-adapter.js";

const PERMITIONS_ENUM = [
    'CREATE_USER', 'UPDATE_USER', 'DELETE_USER', 'READ_USER',
    'CREATE_COURSE', 'UPDATE_COURSE', 'DELETE_COURSE', 'READ_COURSE',
    'CREATE_RULE', 'UPDATE_RULE', 'DELETE_RULE', 'READ_RULE',
    'CREATE_USER_ADMIN', 'UPDATE_USER_ADMIN', 'DELETE_USER_ADMIN', 'READ_USER_ADMIN',
    'CREATE_NEWS', 'UPDATE_NEWS', 'DELETE_NEWS', 'READ_NEWS',
] as const;

export async function ruleRouter(fastify: FastifyInstance, prisma: PrismaClient) {
    const ruleRepository = createRuleAdapter(prisma);
    const userAdminRepository = createUserAdminAdapter(prisma);
    const createRuleController = new CreateRuleController(new CreateRuleUseCase(ruleRepository));
    const updateRuleController = new UpdateRuleController(new UpdateRuleUseCase(ruleRepository, userAdminRepository));
    const listRulesController = new ListRulesController(new ListRulesUseCase(ruleRepository, userAdminRepository));

    fastify.get('/admin/rules', {
        schema: {
            tags: ['Admin — Rules'],
            summary: 'List permission rules (internal)',
            security: [{ bearerAuth: [] }],
            response: {
                200: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'string' },
                            name: { type: 'string' },
                            description: { type: 'string' },
                            permitions: { type: 'array', items: { type: 'string' } },
                            createdAt: { type: 'string' },
                            updatedAt: { type: 'string' },
                        },
                    },
                },
                403: { type: 'object', properties: { error: { type: 'string' } } },
            },
        },
    }, (req: FastifyRequest, res: FastifyReply) => listRulesController.handle(req, res));

    fastify.post('/rules', {
        schema: {
            tags: ['Rules'],
            summary: 'Create permission rule',
            security: [{ bearerAuth: [] }],
            body: {
                type: 'object',
                required: ['name', 'permitions'],
                properties: {
                    name: { type: 'string' },
                    description: { type: 'string' },
                    permitions: {
                        type: 'array',
                        minItems: 1,
                        items: { type: 'string', enum: PERMITIONS_ENUM },
                    },
                },
            },
            response: {
                201: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' },
                        name: { type: 'string' },
                        description: { type: 'string' },
                        permitions: { type: 'array', items: { type: 'string' } },
                        createdAt: { type: 'string', format: 'date-time' },
                        updatedAt: { type: 'string', format: 'date-time' },
                    },
                },
                400: { type: 'object', properties: { error: { type: 'string' } } },
            },
        },
    }, (req: FastifyRequest, res: FastifyReply) => createRuleController.handle(req, res));

    fastify.patch('/rules/:ruleId', {
        schema: {
            tags: ['Rules'],
            summary: 'Update permission rule',
            security: [{ bearerAuth: [] }],
            params: {
                type: 'object',
                required: ['ruleId'],
                properties: { ruleId: { type: 'string' } },
            },
            body: {
                type: 'object',
                properties: {
                    name: { type: 'string' },
                    description: { type: 'string' },
                    permitions: {
                        type: 'array',
                        minItems: 1,
                        items: { type: 'string', enum: PERMITIONS_ENUM },
                    },
                },
            },
            response: {
                200: { type: 'object', properties: { message: { type: 'string' } } },
                400: { type: 'object', properties: { error: { type: 'string' } } },
                403: { type: 'object', properties: { error: { type: 'string' } } },
                404: { type: 'object', properties: { error: { type: 'string' } } },
            },
        },
    }, (req: FastifyRequest<{ Params: { ruleId: string } }>, res: FastifyReply) =>
        updateRuleController.handle(req, res),
    );
}
