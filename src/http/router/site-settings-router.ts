import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { createSiteSettingsAdapter } from '../../adapter/database/site-settings-adapter.js';
import { GetSiteSettingsUseCase } from '../../usecase/get-site-settings.js';
import { UpdateSiteSettingsUseCase } from '../../usecase/update-site-settings.js';
import { SiteSettingsController } from '../controllers/site-settings-controller.js';
import { errorResponse } from '../lib/swagger-schemas.js';
import { publicRoute, requires } from '../lib/route-auth.js';

// Todos os campos são texto (vazio = não preenchido).
const settingFields = [
    'facebook',
    'instagram',
    'whatsapp',
    'orgPhone',
    'orgEmail',
    'orgStreet',
    'orgDistrict',
    'orgCity',
    'orgState',
    'orgZip',
    'orgHours',
    'orgMapQuery',
    'aboutText',
    'quotesSource',
] as const;

const settingsProperties = Object.fromEntries(settingFields.map(k => [k, { type: 'string' }]));

// quotesSource tem endpoint próprio (PUT /admin/market-quotes/source).
const settingsBody = {
    type: 'object',
    properties: Object.fromEntries(
        settingFields.filter(k => k !== 'quotesSource').map(k => [k, { type: 'string' }]),
    ),
};

export async function siteSettingsRouter(fastify: FastifyInstance, prisma: PrismaClient) {
    const repo = createSiteSettingsAdapter(prisma);

    const controller = new SiteSettingsController(
        new GetSiteSettingsUseCase(repo),
        new UpdateSiteSettingsUseCase(repo),
    );

    fastify.get(
        '/site-settings',
        {
            config: { auth: publicRoute() },
            schema: {
                tags: ['Site Settings'],
                summary: 'Configurações públicas do site (redes sociais, dados do sindicato, Sobre, fonte das cotações)',
                response: { 200: { type: 'object',
properties: settingsProperties } },
            },
        },
        (req: FastifyRequest, res: FastifyReply) => controller.getPublic(req, res),
    );

    fastify.get(
        '/admin/site-settings',
        {
            config: { auth: requires('READ_BANNER') },
            schema: {
                tags: ['Site Settings'],
                summary: 'Site settings (admin)',
                security: [{ bearerAuth: [] }],
                response: {
                    200: { type: 'object',
properties: settingsProperties },
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
            config: { auth: requires('UPDATE_BANNER') },
            schema: {
                tags: ['Site Settings'],
                summary: 'Update site settings (admin)',
                security: [{ bearerAuth: [] }],
                body: settingsBody,
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
