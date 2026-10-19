import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { createUnimedAdapter } from '../../adapter/database/unimed-adapter.js';
import { ListUnimedUseCase } from '../../usecase/list-unimed.js';
import { GetUnimedUseCase } from '../../usecase/get-unimed.js';
import { CreateUnimedUseCase } from '../../usecase/create-unimed.js';
import { UpdateUnimedUseCase } from '../../usecase/update-unimed.js';
import { DeleteUnimedUseCase } from '../../usecase/delete-unimed.js';
import { UnimedController } from '../controllers/unimed-controller.js';
import { errorResponse } from '../lib/swagger-schemas.js';
import { requires } from '../lib/route-auth.js';

// UserData básico embutido — cpf pode ser nulo.
const userDataBasic = {
    type: 'object',
    properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        cpf: { type: 'string',
nullable: true },
    },
};

// Linha da tabela: dados-chave do convênio + o UserData básico.
const unimedListItem = {
    type: 'object',
    properties: {
        id: { type: 'string' },
        userDataId: { type: 'string' },
        userData: userDataBasic,
        plano: { type: 'string',
nullable: true },
        matricula: { type: 'string',
nullable: true },
        tipoDependente: { type: 'string',
nullable: true },
        grauDependencia: { type: 'string',
nullable: true },
        titularId: { type: 'string',
nullable: true },
        dataAdesao: { type: 'string',
nullable: true },
        createdAt: { type: 'string' },
    },
};

const unimedListResponse = {
    type: 'object',
    properties: {
        data: { type: 'array',
items: unimedListItem },
        total: { type: 'integer' },
        page: { type: 'integer' },
        totalPages: { type: 'integer' },
        limit: { type: 'integer' },
    },
};

// Beneficiário completo (detalhe). Quase tudo é opcional no banco → nullable: true
// (um null num campo não-nullable causaria 500 na serialização do Fastify).
const unimedDetail = {
    type: 'object',
    properties: {
        id: { type: 'string' },
        userDataId: { type: 'string' },
        userData: userDataBasic,
        dataAdesao: { type: 'string',
nullable: true },
        tipoMovimento: { type: 'string',
nullable: true },
        tipoDependente: { type: 'string',
nullable: true },
        grauDependencia: { type: 'string',
nullable: true },
        cns: { type: 'string',
nullable: true },
        nomeMae: { type: 'string',
nullable: true },
        profissao: { type: 'string',
nullable: true },
        plano: { type: 'string',
nullable: true },
        matricula: { type: 'string',
nullable: true },
        empresa: { type: 'string',
nullable: true },
        contratante: { type: 'string',
nullable: true },
        titularId: { type: 'string',
nullable: true },
        motivo: { type: 'string',
nullable: true },
        obs: { type: 'string',
nullable: true },
        isDeleted: { type: 'boolean' },
        deletedAt: { type: 'string',
nullable: true },
        createdBy: { type: 'string',
nullable: true },
        createdAt: { type: 'string' },
        updatedAt: { type: 'string' },
    },
};

// Corpo de criação/edição — só campos do convênio (a pessoa vive no UserData).
const unimedBody = {
    type: 'object',
    required: ['userDataId'],
    properties: {
        userDataId: { type: 'string',
example: '2b3c4d5e-6f70-4a1b-8c2d-3e4f5a6b7c8d' },
        dataAdesao: { type: 'string',
nullable: true,
example: '2026-01-15' },
        tipoMovimento: { type: 'string',
nullable: true,
example: 'INCLUSAO DE TITULAR' },
        tipoDependente: { type: 'string',
nullable: true },
        grauDependencia: { type: 'string',
nullable: true },
        cns: { type: 'string',
nullable: true,
description: 'Cartão Nacional de Saúde: 15 dígitos (gravado sem máscara).',
example: '700000000000000' },
        nomeMae: { type: 'string',
nullable: true },
        profissao: { type: 'string',
nullable: true },
        plano: { type: 'string',
nullable: true,
example: 'Unimed Nacional' },
        matricula: { type: 'string',
nullable: true },
        empresa: { type: 'string',
nullable: true },
        contratante: { type: 'string',
nullable: true },
        titularId: { type: 'string',
nullable: true },
        motivo: { type: 'string',
nullable: true },
        obs: { type: 'string',
nullable: true },
    },
};

export async function unimedRouter(fastify: FastifyInstance, prisma: PrismaClient) {
    const repo = createUnimedAdapter(prisma);

    const controller = new UnimedController(
        new ListUnimedUseCase(repo),
        new GetUnimedUseCase(repo),
        new CreateUnimedUseCase(repo),
        new UpdateUnimedUseCase(repo),
        new DeleteUnimedUseCase(repo),
    );

    const tags = ['Unimed'];

    fastify.get(
        '/admin/unimed',
        {
            config: { auth: requires('READ_USER') },
            schema: {
                tags,
                summary: 'List Unimed beneficiaries (admin)',
                description: 'Paginado. ?search filtra pelo nome ou CPF do usuário vinculado; '
                    + '?userDataId traz os cadastros da pessoa (o dela e os em que ela é o titular).',
                querystring: {
                    type: 'object',
                    properties: {
                        page: { type: 'integer',
minimum: 1,
default: 1 },
                        limit: { type: 'integer',
minimum: 1,
maximum: 1000,
default: 20 },
                        search: { type: 'string' },
                        userDataId: { type: 'string' },
                    },
                },
                response: {
                    200: unimedListResponse,
                    401: errorResponse,
                    403: errorResponse,
                },
            },
        },
        (req: FastifyRequest, res: FastifyReply) => controller.list(req, res),
    );

    fastify.get(
        '/admin/unimed/:id',
        {
            config: { auth: requires('READ_USER') },
            schema: {
                tags,
                summary: 'Get a Unimed beneficiary (admin)',
                params: { type: 'object',
required: ['id'],
properties: { id: { type: 'string' } } },
                response: {
                    200: unimedDetail,
                    401: errorResponse,
                    403: errorResponse,
                    404: errorResponse,
                },
            },
        },
        (req: FastifyRequest<{ Params: { id: string } }>, res: FastifyReply) =>
            controller.get(req, res),
    );

    fastify.post(
        '/admin/unimed',
        {
            config: { auth: requires('CREATE_USER') },
            schema: {
                tags,
                summary: 'Create a Unimed beneficiary',
                body: unimedBody,
                response: {
                    400: errorResponse,
                    401: errorResponse,
                    403: errorResponse,
                    409: errorResponse,
                },
            },
        },
        (req: FastifyRequest, res: FastifyReply) => controller.create(req, res),
    );

    fastify.patch(
        '/admin/unimed/:id',
        {
            config: { auth: requires('UPDATE_USER') },
            schema: {
                tags,
                summary: 'Update a Unimed beneficiary',
                params: { type: 'object',
required: ['id'],
properties: { id: { type: 'string' } } },
                body: { type: 'object',
properties: unimedBody.properties },
                response: {
                    200: { type: 'object',
properties: { message: { type: 'string' } } },
                    400: errorResponse,
                    401: errorResponse,
                    403: errorResponse,
                    404: errorResponse,
                },
            },
        },
        (req: FastifyRequest<{ Params: { id: string } }>, res: FastifyReply) =>
            controller.update(req, res),
    );

    fastify.delete(
        '/admin/unimed/:id',
        {
            config: { auth: requires('DELETE_USER') },
            schema: {
                tags,
                summary: 'Delete (soft) a Unimed beneficiary',
                params: { type: 'object',
required: ['id'],
properties: { id: { type: 'string' } } },
                response: {
                    204: { type: 'null' },
                    401: errorResponse,
                    403: errorResponse,
                    404: errorResponse,
                },
            },
        },
        (req: FastifyRequest<{ Params: { id: string } }>, res: FastifyReply) =>
            controller.remove(req, res),
    );
}
