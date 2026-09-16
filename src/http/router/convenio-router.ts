import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client/extension';
import { createConvenioAdapter } from '../../adapter/database/convenio-adapter.js';
import { createUserAdminAdapter } from '../../adapter/database/user-admin-adapter.js';
import { createRuleAdapter } from '../../adapter/database/rule-adapter.js';
import { createStorageAdapter } from '../../adapter/storage/factory.js';
import { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import {
    ListConvenioMenuUseCase,
    ListConveniosUseCase,
    GetPublicConvenioUseCase,
    GetConvenioUseCase,
    CreateConvenioUseCase,
    UpdateConvenioUseCase,
    DeleteConvenioUseCase,
} from '../../usecase/convenio-usecases.js';
import { UploadConvenioLogoUseCase } from '../../usecase/upload-convenio-logo.js';
import { ConvenioController } from '../controllers/convenio-controller.js';
import { errorResponse } from '../lib/swagger-schemas.js';

// ── Schemas (Swagger + serialização) ─────────────────────────────────────────
// A resposta é serializada pelo fast-json-stringify, que descarta campos não
// declarados — por isso todos os campos do convênio estão listados aqui.

const nullableString = { type: 'string',
nullable: true };

const priceRowSchema = {
    type: 'object',
    properties: {
        label: { type: 'string',
example: '0 a 18 anos' },
        priceCents: { type: 'integer',
example: 31713 },
    },
};

const stringList = { type: 'array',
items: { type: 'string' } };

const convenioProperties = {
    id: { type: 'string' },
    slug: { type: 'string',
example: 'unimed' },
    name: { type: 'string',
example: 'Unimed' },
    title: { type: 'string',
example: 'Tabela de valores / Unimed' },
    subtitle: nullableString,
    intro: nullableString,
    logoUrl: nullableString,
    priceLabelHeader: { type: 'string' },
    priceValueHeader: { type: 'string' },
    priceRows: { type: 'array',
items: priceRowSchema },
    priceNote: nullableString,
    documentsTitle: { type: 'string' },
    documents: stringList,
    highlightsTitle: nullableString,
    highlights: stringList,
    aboutTitle: nullableString,
    aboutText: nullableString,
    isActive: { type: 'boolean' },
    order: { type: 'integer' },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
};

const convenioObject = { type: 'object',
properties: convenioProperties };

// O corpo é validado de verdade pelo zod no caso de uso; aqui é documentação.
const { id: _id, logoUrl: _logo, createdAt: _c, updatedAt: _u, ...editable } = convenioProperties;
const convenioBody = { type: 'object',
properties: { ...editable,
logoUrl: { type: 'null' } } };

const idParams = { type: 'object',
required: ['id'],
properties: { id: { type: 'string' } } };

export async function convenioRouter(fastify: FastifyInstance, prisma: PrismaClient) {
    const repo = createConvenioAdapter(prisma);
    const getAdminPermissions = new GetAdminPermissionsUseCase(
        createUserAdminAdapter(prisma),
        createRuleAdapter(prisma),
    );

    const controller = new ConvenioController(
        {
            listMenu: new ListConvenioMenuUseCase(repo),
            list: new ListConveniosUseCase(repo),
            getPublic: new GetPublicConvenioUseCase(repo),
            get: new GetConvenioUseCase(repo),
            create: new CreateConvenioUseCase(repo),
            update: new UpdateConvenioUseCase(repo),
            remove: new DeleteConvenioUseCase(repo),
            uploadLogo: new UploadConvenioLogoUseCase(repo, createStorageAdapter()),
        },
        getAdminPermissions,
    );

    const adminSecurity = [{ bearerAuth: [] }];
    const adminErrors = { 400: errorResponse,
401: errorResponse,
403: errorResponse,
404: errorResponse };

    // ── Público ──────────────────────────────────────────────────────────────
    fastify.get(
        '/convenios',
        {
            schema: {
                tags: ['Convênios'],
                summary: 'Menu de convênios ativos (público)',
                description: 'Lista enxuta para o dropdown "Convênios" do site.',
                response: {
                    200: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                id: { type: 'string' },
                                slug: { type: 'string' },
                                name: { type: 'string' },
                                subtitle: nullableString,
                                logoUrl: nullableString,
                                order: { type: 'integer' },
                            },
                        },
                    },
                },
            },
        },
        (req: FastifyRequest, res: FastifyReply) => controller.menu(req, res),
    );

    fastify.get(
        '/convenios/:slug',
        {
            schema: {
                tags: ['Convênios'],
                summary: 'Página pública de um convênio',
                description: 'Convênio inativo ou inexistente responde 404.',
                params: { type: 'object',
required: ['slug'],
properties: { slug: { type: 'string' } } },
                response: { 200: convenioObject,
404: errorResponse },
            },
        },
        (req: FastifyRequest<{ Params: { slug: string } }>, res: FastifyReply) => controller.getPublic(req, res),
    );

    // ── Admin ────────────────────────────────────────────────────────────────
    fastify.get(
        '/admin/convenios',
        {
            schema: {
                tags: ['Convênios'],
                summary: 'Listar convênios (admin)',
                security: adminSecurity,
                response: { 200: { type: 'array',
items: convenioObject },
401: errorResponse,
403: errorResponse },
            },
        },
        (req: FastifyRequest, res: FastifyReply) => controller.list(req, res),
    );

    fastify.get(
        '/admin/convenios/:id',
        {
            schema: {
                tags: ['Convênios'],
                summary: 'Detalhe do convênio (admin)',
                security: adminSecurity,
                params: idParams,
                response: { 200: convenioObject,
...adminErrors },
            },
        },
        (req: FastifyRequest<{ Params: { id: string } }>, res: FastifyReply) => controller.get(req, res),
    );

    fastify.post(
        '/admin/convenios',
        {
            schema: {
                tags: ['Convênios'],
                summary: 'Criar convênio',
                security: adminSecurity,
                body: { ...convenioBody,
required: ['slug', 'name', 'title'] },
                response: { 201: convenioObject,
...adminErrors,
409: errorResponse },
            },
        },
        (req: FastifyRequest, res: FastifyReply) => controller.create(req, res),
    );

    fastify.patch(
        '/admin/convenios/:id',
        {
            schema: {
                tags: ['Convênios'],
                summary: 'Atualizar convênio',
                description: 'Campos parciais. `logoUrl: null` remove o logo.',
                security: adminSecurity,
                params: idParams,
                body: convenioBody,
                response: { 200: convenioObject,
...adminErrors,
409: errorResponse },
            },
        },
        (req: FastifyRequest<{ Params: { id: string } }>, res: FastifyReply) => controller.update(req, res),
    );

    fastify.delete(
        '/admin/convenios/:id',
        {
            schema: {
                tags: ['Convênios'],
                summary: 'Excluir convênio',
                security: adminSecurity,
                params: idParams,
                response: { 204: { type: 'null' },
401: errorResponse,
403: errorResponse,
404: errorResponse },
            },
        },
        (req: FastifyRequest<{ Params: { id: string } }>, res: FastifyReply) => controller.remove(req, res),
    );

    fastify.post(
        '/admin/convenios/:id/logo',
        {
            schema: {
                tags: ['Convênios'],
                summary: 'Upload do logo do convênio',
                description: 'multipart/form-data, campo "file". JPG/PNG/WEBP/GIF. Reduzido para caber em 480×240, salvo em PNG.',
                security: adminSecurity,
                params: idParams,
                response: {
                    200: { type: 'object',
properties: { logoUrl: { type: 'string' } } },
                    ...adminErrors,
                },
            },
        },
        (req: FastifyRequest<{ Params: { id: string } }>, res: FastifyReply) => controller.uploadLogo(req, res),
    );
}
