import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client/extension';
import { createPublicContactAdapter } from '../../adapter/database/public-contact-adapter.js';
import { createUserDataAdapter } from '../../adapter/database/user-data.js';
import { createUserAdminAdapter } from '../../adapter/database/user-admin-adapter.js';
import { createRuleAdapter } from '../../adapter/database/rule-adapter.js';
import { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import {
    ListPublicContactsUseCase,
    AddPublicContactUseCase,
    UpdatePublicContactUseCase,
    RemovePublicContactUseCase,
    ReorderPublicContactsUseCase,
} from '../../usecase/public-contact-usecases.js';
import type { Permission } from '../../generated/prisma/enums.js';
import { requirePermission, errorToStatus } from '../lib/require-permission.js';
import { errorResponse } from '../lib/swagger-schemas.js';

const str = { type: 'string' };
const nstr = { type: 'string',
nullable: true };
const person = { type: 'object',
properties: { id: str,
name: str,
email: nstr,
phone: str,
avatar: nstr } };
const contactObject = {
    type: 'object',
    properties: { id: str,
userDataId: str,
title: nstr,
order: { type: 'integer' },
userData: person },
};
const idParams = { type: 'object',
required: ['id'],
properties: { id: str } };
const sec = [{ bearerAuth: [] }];
const errs = { 400: errorResponse,
401: errorResponse,
403: errorResponse,
404: errorResponse };
const tags = ['Contatos Públicos'];

// Quem expõe e-mail/telefone de uma pessoa no site é quem gere cadastros:
// permissões de usuários.
export async function publicContactRouter(fastify: FastifyInstance, prisma: PrismaClient) {
    const repo = createPublicContactAdapter(prisma);
    const list = new ListPublicContactsUseCase(repo);
    const add = new AddPublicContactUseCase(repo, createUserDataAdapter(prisma));
    const update = new UpdatePublicContactUseCase(repo);
    const remove = new RemovePublicContactUseCase(repo);
    const reorder = new ReorderPublicContactsUseCase(repo);
    const getAdminPermissions = new GetAdminPermissionsUseCase(createUserAdminAdapter(prisma), createRuleAdapter(prisma));

    const can = (req: FastifyRequest, reply: FastifyReply, perm: Permission) =>
        requirePermission(req, reply, perm, getAdminPermissions);
    const fail = (reply: FastifyReply, error: Error) =>
        reply.status(errorToStatus(error)).send({ error: error.message });

    fastify.get('/contacts', {
        schema: {
            tags,
            summary: 'Contatos públicos (página Contato)',
            description: 'Pessoas em "Nossa Equipe", na ordem definida no painel. Sem autenticação.',
            response: {
                200: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            publicTitle: nstr,
                            userData: { type: 'object',
properties: { name: str,
email: nstr,
phone: str,
avatar: nstr } },
                        },
                    },
                },
            },
        },
    }, async (_req: FastifyRequest, reply: FastifyReply) => reply.send(await list.listPublic()));

    fastify.get('/admin/public-contacts', {
        schema: { tags,
summary: 'Contatos públicos (admin)',
security: sec,
response: { 200: { type: 'array',
items: contactObject },
401: errorResponse,
403: errorResponse } },
    }, async (req: FastifyRequest, reply: FastifyReply) => {
        if ((await can(req, reply, 'READ_USER')) === null) return;
        return reply.send(await list.list());
    });

    fastify.post('/admin/public-contacts', {
        schema: {
            tags,
            summary: 'Adicionar pessoa aos contatos públicos',
            security: sec,
            body: { type: 'object',
required: ['userDataId'],
properties: { userDataId: str,
title: nstr } },
            response: { 201: contactObject,
...errs,
409: errorResponse },
        },
    }, async (req: FastifyRequest, reply: FastifyReply) => {
        if ((await can(req, reply, 'UPDATE_USER')) === null) return;
        const r = await add.execute(req.body);
        if (r.error) return fail(reply, r.error);
        return reply.status(201).send(r.contact);
    });

    // Antes de /:id para "reorder" não ser lido como id.
    fastify.patch('/admin/public-contacts/reorder', {
        schema: {
            tags,
            summary: 'Reordenar contatos públicos',
            security: sec,
            body: { type: 'object',
required: ['order'],
properties: { order: { type: 'array',
items: str } } },
            response: { 200: { type: 'object',
properties: { message: str } },
...errs },
        },
    }, async (req: FastifyRequest, reply: FastifyReply) => {
        if ((await can(req, reply, 'UPDATE_USER')) === null) return;
        const r = await reorder.execute(req.body);
        if (r.error) return fail(reply, r.error);
        return reply.send({ message: 'ok' });
    });

    fastify.patch('/admin/public-contacts/:id', {
        schema: {
            tags,
            summary: 'Editar cargo do contato público',
            security: sec,
            params: idParams,
            body: { type: 'object',
properties: { title: nstr } },
            response: { 200: contactObject,
...errs },
        },
    }, async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        if ((await can(req, reply, 'UPDATE_USER')) === null) return;
        const r = await update.execute(req.params.id, req.body);
        if (r.error) return fail(reply, r.error);
        return reply.send(r.contact);
    });

    fastify.delete('/admin/public-contacts/:id', {
        schema: { tags,
summary: 'Tirar dos contatos públicos',
security: sec,
params: idParams,
response: { 204: { type: 'null' },
...errs } },
    }, async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        if ((await can(req, reply, 'UPDATE_USER')) === null) return;
        const r = await remove.execute(req.params.id);
        if (r.error) return fail(reply, r.error);
        return reply.status(204).send();
    });
}
