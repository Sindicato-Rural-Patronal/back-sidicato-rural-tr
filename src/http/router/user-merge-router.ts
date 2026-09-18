import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client/extension';
import { createUserMergeAdapter } from '../../adapter/database/user-merge-adapter.js';
import { createUserAdminAdapter } from '../../adapter/database/user-admin-adapter.js';
import { createRuleAdapter } from '../../adapter/database/rule-adapter.js';
import { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import {
    ComparePeopleForMergeUseCase,
    ListDuplicatePeopleUseCase,
    MergeUsersUseCase,
} from '../../usecase/merge-users.js';
import { requirePermission, errorToStatus } from '../lib/require-permission.js';
import { errorResponse } from '../lib/swagger-schemas.js';

const str = { type: 'string' };
const nstr = { type: 'string',
nullable: true };
const int = { type: 'integer' };
const tags = ['Admin — Users'];
const sec = [{ bearerAuth: [] }];

const duplicatePerson = {
    type: 'object',
    properties: {
        id: str,
        name: str,
        cpf: nstr,
        email: nstr,
        phone: str,
        createdAt: str,
        hasLogin: { type: 'boolean' },
        counts: {
            type: 'object',
            properties: { registrations: int,
companies: int,
properties: int,
relations: int },
        },
    },
};

// Juntar cadastros repetidos da mesma pessoa. A inscrição pública em curso só
// reconhece a pessoa pelo CPF, então quem estava cadastrado sem CPF ganha um
// segundo cadastro ao se inscrever — a equipe junta os dois por aqui.
export async function userMergeRouter(fastify: FastifyInstance, prisma: PrismaClient) {
    const repo = createUserMergeAdapter(prisma);
    const duplicates = new ListDuplicatePeopleUseCase(repo);
    const compare = new ComparePeopleForMergeUseCase(repo);
    const merge = new MergeUsersUseCase(repo);
    const getAdminPermissions = new GetAdminPermissionsUseCase(
        createUserAdminAdapter(prisma),
        createRuleAdapter(prisma),
    );

    fastify.get('/admin/users/duplicates', {
        schema: {
            tags,
            summary: 'Possíveis cadastros duplicados',
            description:
                'Grupos de pessoas ativas com o mesmo nome normalizado, telefone ou e-mail, em que pelo menos uma está sem CPF.',
            security: sec,
            querystring: {
                type: 'object',
                properties: { limit: { type: 'integer',
minimum: 1,
maximum: 200,
default: 50 } },
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        groups: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    key: str,
                                    reason: { type: 'string',
enum: ['NOME', 'TELEFONE', 'EMAIL'] },
                                    people: { type: 'array',
items: duplicatePerson },
                                },
                            },
                        },
                    },
                },
                401: errorResponse,
                403: errorResponse,
            },
        },
    }, async (req: FastifyRequest<{ Querystring: { limit?: number } }>, reply: FastifyReply) => {
        if ((await requirePermission(req, reply, 'READ_USER', getAdminPermissions)) === null) return;
        return reply.send(await duplicates.execute({ limit: req.query.limit }));
    });

    fastify.get('/admin/users/merge-preview', {
        schema: {
            tags,
            summary: 'Comparar dois cadastros antes de juntar',
            description: 'Os dois cadastros de `ids` (separados por vírgula) com os mesmos números da lista de duplicados.',
            security: sec,
            querystring: {
                type: 'object',
                required: ['ids'],
                properties: { ids: { type: 'string',
description: 'Dois ids separados por vírgula' } },
            },
            response: {
                200: { type: 'object',
properties: { people: { type: 'array',
items: duplicatePerson } } },
                400: errorResponse,
                401: errorResponse,
                403: errorResponse,
                404: errorResponse,
            },
        },
    }, async (req: FastifyRequest<{ Querystring: { ids?: string } }>, reply: FastifyReply) => {
        if ((await requirePermission(req, reply, 'READ_USER', getAdminPermissions)) === null) return;
        const r = await compare.execute((req.query.ids ?? '').split(','));
        if (r.error) return reply.status(errorToStatus(r.error)).send({ error: r.error.message });
        return reply.send({ people: r.people });
    });

    fastify.post('/admin/users/merge', {
        schema: {
            tags,
            summary: 'Juntar dois cadastros da mesma pessoa',
            description: `Leva tudo do cadastro \`removeId\` para o \`keepId\` numa transação só e marca o removido como excluído (nunca apaga).

**O que é movido:** inscrições em cursos (inscrição repetida no mesmo curso é cancelada), vínculos com empresas (vínculo repetido mantém o título do cadastro que fica), propriedades, relações (nos dois sentidos), beneficiário Unimed, contato público, ficha de instrutor e acesso ao painel — os três últimos só quando o cadastro que fica ainda não tem o seu.

**Campos vazios** do cadastro que fica são preenchidos com o que havia no removido (CPF, RG, nascimento, e-mail, telefone…); nada preenchido é sobrescrito.

**Recusa:** mesmo id, cadastro já excluído, CPFs diferentes (409) e os dois com login (409).`,
            security: sec,
            body: {
                type: 'object',
                required: ['keepId', 'removeId'],
                properties: { keepId: str,
removeId: str },
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        keepId: str,
                        removedId: str,
                        movedRegistrations: int,
                        movedCompanies: int,
                        movedProperties: int,
                        movedRelations: int,
                        filledFields: { type: 'array',
items: str },
                    },
                },
                400: errorResponse,
                401: errorResponse,
                403: errorResponse,
                404: errorResponse,
                409: errorResponse,
            },
        },
    }, async (
        req: FastifyRequest<{
 Body: {
 keepId?: string;
removeId?: string 
} 
}>,
        reply: FastifyReply,
    ) => {
        // Junta dois cadastros e exclui um: exige as duas permissões.
        if ((await requirePermission(req, reply, 'DELETE_USER', getAdminPermissions)) === null) return;
        if ((await requirePermission(req, reply, 'UPDATE_USER', getAdminPermissions)) === null) return;
        const r = await merge.execute(req.body);
        if (r.error) return reply.status(errorToStatus(r.error)).send({ error: r.error.message });
        return reply.send(r.result);
    });
}
