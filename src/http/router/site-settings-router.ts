import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client/extension';
import { createSiteSettingsAdapter } from '../../adapter/database/site-settings-adapter.js';
import { createUserAdminAdapter } from '../../adapter/database/user-admin-adapter.js';
import { createRuleAdapter } from '../../adapter/database/rule-adapter.js';
import { GetSiteSettingsUseCase } from '../../usecase/get-site-settings.js';
import { UpdateSiteSettingsUseCase } from '../../usecase/update-site-settings.js';
import { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { SiteSettingsController } from '../controllers/site-settings-controller.js';
import { errorResponse } from '../lib/swagger-schemas.js';

const socialProperties = {
    facebook: { type: 'string' },
    instagram: { type: 'string' },
    whatsapp: { type: 'string' },
};

const socialBody = {
    type: 'object',
    properties: {
        facebook: { type: 'string',
nullable: true },
        instagram: { type: 'string',
nullable: true },
        whatsapp: { type: 'string',
nullable: true },
    },
};

export async function siteSettingsRouter(fastify: FastifyInstance, prisma: PrismaClient) {
    const repo = createSiteSettingsAdapter(prisma);
    const userAdminRepository = createUserAdminAdapter(prisma);
    const ruleRepository = createRuleAdapter(prisma);
    const getAdminPermissions = new GetAdminPermissionsUseCase(userAdminRepository, ruleRepository);

    const controller = new SiteSettingsController(
        new GetSiteSettingsUseCase(repo),
        new UpdateSiteSettingsUseCase(repo),
        getAdminPermissions,
    );

    fastify.get(
        '/site-settings',
        {
            schema: {
                tags: ['Site Settings'],
                summary: 'Public site settings (social links)',
                response: { 200: { type: 'object',
properties: socialProperties } },
            },
        },
        (req: FastifyRequest, res: FastifyReply) => controller.getPublic(req, res),
    );

    fastify.get(
        '/admin/site-settings',
        {
            schema: {
                tags: ['Site Settings'],
                summary: 'Site settings (admin)',
                security: [{ bearerAuth: [] }],
                response: {
                    200: { type: 'object',
properties: socialProperties },
                    401: errorResponse,
                    403: errorResponse,
                },
            },
        },
        (req: FastifyRequest, res: FastifyReply) => controller.getAdmin(req, res),
    );

    fastify.patch(
        '/admin/site-settings',
        {
            schema: {
                tags: ['Site Settings'],
                summary: 'Update site settings (admin)',
                security: [{ bearerAuth: [] }],
                body: socialBody,
                response: {
                    200: { type: 'object',
properties: { message: { type: 'string' } } },
                    400: errorResponse,
                    401: errorResponse,
                    403: errorResponse,
                },
            },
        },
        (req: FastifyRequest, res: FastifyReply) => controller.update(req, res),
    );
}
