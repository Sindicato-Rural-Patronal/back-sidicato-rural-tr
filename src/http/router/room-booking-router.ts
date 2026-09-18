import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client/extension';
import { createRoomBookingAdapter } from '../../adapter/database/room-booking-adapter.js';
import { createUserAdminAdapter } from '../../adapter/database/user-admin-adapter.js';
import { createRuleAdapter } from '../../adapter/database/rule-adapter.js';
import { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import {
    CreateRoomBookingUseCase,
    DeleteRoomBookingUseCase,
    GetRoomScheduleUseCase,
    ListPublicEventsUseCase,
    ListRoomBookingsUseCase,
    MAX_RANGE_DAYS,
    PUBLIC_EVENTS_LIMIT,
    UpdateRoomBookingUseCase,
} from '../../usecase/room-booking-usecases.js';
import { MAX_OCCURRENCES } from '../../usecase/room-availability.js';
import type { Permission } from '../../generated/prisma/enums.js';
import { errorToStatus, requirePermission } from '../lib/require-permission.js';
import { errorResponse } from '../lib/swagger-schemas.js';

const str = { type: 'string' };
const nstr = { type: 'string',
nullable: true };
const bookingTypeSchema = { type: 'string',
enum: ['EVENT', 'MEETING'] };

// fast-json-stringify descarta campo não declarado: tudo o que sai está aqui.
const bookingObject = {
    type: 'object',
    properties: {
        id: str,
        type: str,
        title: str,
        description: nstr,
        publicOnSite: { type: 'boolean' },
        publicDescription: nstr,
        roomId: str,
        roomName: str,
        startTime: str,
        endTime: str,
        responsible: {
            type: 'object',
            nullable: true,
            properties: { id: str,
name: str },
        },
        responsibleName: nstr,
        seriesId: nstr,
    },
};

const scheduleObject = {
    type: 'object',
    properties: {
        kind: str,
        id: str,
        title: str,
        roomId: str,
        roomName: str,
        startTime: str,
        endTime: str,
        status: nstr,
        seriesId: nstr,
        publicOnSite: { type: 'boolean' },
    },
};

// Evento publicado no site (rota pública, sem dados internos).
const publicEventObject = {
    type: 'object',
    properties: {
        id: str,
        title: str,
        description: nstr,
        startTime: str,
        endTime: str,
        roomName: str,
    },
};

const rangeQuery = {
    from: { type: 'string',
description: 'Primeiro dia (AAAA-MM-DD), obrigatório' },
    to: { type: 'string',
description: `Último dia (AAAA-MM-DD), obrigatório; até ${MAX_RANGE_DAYS} dias depois de from` },
    roomId: str,
};

const idParams = { type: 'object',
required: ['id'],
properties: { id: str } };
const sec = [{ bearerAuth: [] }];
const tags = ['Reservas de sala'];
const errs = { 400: errorResponse,
401: errorResponse,
403: errorResponse };

const timeNote =
    'Horários como os do curso: hora "de parede" de Brasília rotulada em UTC (08:00 em Terra Roxa = `…T08:00:00.000Z`).';

// Eventos e reuniões que ocupam as salas, além dos cursos. Mesmas permissões dos
// cursos/salas: ler READ_COURSE, criar CREATE_COURSE, editar UPDATE_COURSE, excluir DELETE_COURSE.
export async function roomBookingRouter(fastify: FastifyInstance, prisma: PrismaClient) {
    const repo = createRoomBookingAdapter(prisma);
    const list = new ListRoomBookingsUseCase(repo);
    const schedule = new GetRoomScheduleUseCase(repo);
    const create = new CreateRoomBookingUseCase(repo);
    const update = new UpdateRoomBookingUseCase(repo);
    const remove = new DeleteRoomBookingUseCase(repo);
    const publicEvents = new ListPublicEventsUseCase(repo);
    const getAdminPermissions = new GetAdminPermissionsUseCase(createUserAdminAdapter(prisma), createRuleAdapter(prisma));

    const can = (req: FastifyRequest, reply: FastifyReply, perm: Permission) =>
        requirePermission(req, reply, perm, getAdminPermissions);
    const fail = (reply: FastifyReply, error: Error) => reply.status(errorToStatus(error)).send({ error: error.message });

    // ─── Rota pública ──────────────────────────────────────────────────────
    fastify.get(
        '/events',
        {
            schema: {
                tags,
                summary: 'Eventos publicados no site',
                description: `Eventos (nunca reuniões) marcados como "Mostrar no site" que ainda não terminaram, do mais próximo em diante, no máximo ${PUBLIC_EVENTS_LIMIT}. ${timeNote}`,
                response: { 200: { type: 'array',
items: publicEventObject } },
            },
        },
        async (_req: FastifyRequest, reply: FastifyReply) => {
            const r = await publicEvents.execute();
            return reply.send(r.events);
        },
    );

    fastify.get(
        '/admin/room-bookings',
        {
            schema: {
                tags,
                summary: 'Listar reservas de sala (eventos e reuniões)',
                description: `Reservas não excluídas que sobrepõem o período [from 00:00, to 23:59:59], por início. Sem paginação. ${timeNote}`,
                security: sec,
                querystring: {
                    type: 'object',
                    properties: {
                        ...rangeQuery,
                        type: bookingTypeSchema,
                        search: { type: 'string',
description: 'Título, descrição ou responsável' },
                    },
                },
                response: { 200: { type: 'array',
items: bookingObject },
...errs },
            },
        },
        async (req: FastifyRequest, reply: FastifyReply) => {
            if ((await can(req, reply, 'READ_COURSE')) === null) return;
            const r = await list.execute(req.query);
            if (r.error) return fail(reply, r.error);
            return reply.send(r.bookings);
        },
    );

    fastify.get(
        '/admin/room-schedule',
        {
            schema: {
                tags,
                summary: 'Agenda das salas (cursos + reservas)',
                description: `Cursos não excluídos (qualquer status; \`status\` vem preenchido) e reservas que sobrepõem o período, por início. ${timeNote}`,
                security: sec,
                querystring: { type: 'object',
properties: rangeQuery },
                response: { 200: { type: 'array',
items: scheduleObject },
...errs },
            },
        },
        async (req: FastifyRequest, reply: FastifyReply) => {
            if ((await can(req, reply, 'READ_COURSE')) === null) return;
            const r = await schedule.execute(req.query);
            if (r.error) return fail(reply, r.error);
            return reply.send(r.items);
        },
    );

    fastify.post(
        '/admin/room-bookings',
        {
            schema: {
                tags,
                summary: 'Criar reserva de sala (com repetição opcional)',
                description: `Cria o evento/reunião. \`repeat\` cria uma ocorrência por semana (WEEKLY) ou por mês no mesmo dia (MONTHLY; mês sem o dia é pulado) até \`until\` inclusive, no máximo ${MAX_OCCURRENCES}. Todas as ocorrências são checadas antes: se alguma bate com curso ou reserva na mesma sala → 409 "Sala ocupada: …" e nada é criado. Encostar (terminar quando o outro começa) é permitido. ${timeNote}`,
                security: sec,
                body: {
                    type: 'object',
                    required: ['type', 'title', 'roomId', 'startTime', 'endTime'],
                    properties: {
                        type: bookingTypeSchema,
                        title: { type: 'string',
example: 'Reunião da diretoria' },
                        description: nstr,
                        publicOnSite: { type: 'boolean',
description: 'Mostrar na página pública de eventos (só type EVENT).' },
                        publicDescription: nstr,
                        roomId: str,
                        startTime: { type: 'string',
example: '2026-10-05T08:00:00.000Z' },
                        endTime: { type: 'string',
example: '2026-10-05T12:00:00.000Z' },
                        responsibleUserDataId: nstr,
                        responsibleName: nstr,
                        repeat: {
                            type: 'object',
                            nullable: true,
                            required: ['frequency', 'until'],
                            properties: {
                                frequency: { type: 'string',
enum: ['WEEKLY', 'MONTHLY'] },
                                until: { type: 'string',
example: '2026-12-31' },
                            },
                        },
                    },
                },
                response: {
                    201: {
                        type: 'object',
                        properties: { ids: { type: 'array',
items: str },
seriesId: nstr },
                    },
                    ...errs,
                    404: errorResponse,
                    409: errorResponse,
                },
            },
        },
        async (req: FastifyRequest, reply: FastifyReply) => {
            if ((await can(req, reply, 'CREATE_COURSE')) === null) return;
            const r = await create.execute(req.body);
            if (r.error) return fail(reply, r.error);
            return reply.status(201).send({ ids: r.ids,
seriesId: r.seriesId ?? null });
        },
    );

    fastify.patch(
        '/admin/room-bookings/:id',
        {
            schema: {
                tags,
                summary: 'Editar uma ocorrência da reserva',
                description: `Muda só esta ocorrência (as outras da série ficam como estão). Mudando sala ou horário, checa conflito sem contar ela mesma → 409. \`description\`, \`responsibleUserDataId\` e \`responsibleName\` aceitam null para limpar. ${timeNote}`,
                security: sec,
                params: idParams,
                body: {
                    type: 'object',
                    properties: {
                        type: bookingTypeSchema,
                        title: str,
                        description: nstr,
                        publicOnSite: { type: 'boolean' },
                        publicDescription: nstr,
                        roomId: str,
                        startTime: str,
                        endTime: str,
                        responsibleUserDataId: nstr,
                        responsibleName: nstr,
                    },
                },
                response: { 200: bookingObject,
...errs,
404: errorResponse,
409: errorResponse },
            },
        },
        async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
            if ((await can(req, reply, 'UPDATE_COURSE')) === null) return;
            const r = await update.execute(req.params.id, req.body);
            if (r.error) return fail(reply, r.error);
            return reply.send(r.booking);
        },
    );

    fastify.delete(
        '/admin/room-bookings/:id',
        {
            schema: {
                tags,
                summary: 'Excluir reserva (uma ou desta em diante na série)',
                description: 'Exclusão lógica. `scope=one` (padrão) só esta; `scope=future` esta e as seguintes da mesma série.',
                security: sec,
                params: idParams,
                querystring: { type: 'object',
properties: { scope: { type: 'string',
enum: ['one', 'future'] } } },
                response: {
                    200: { type: 'object',
properties: { deleted: { type: 'integer' } } },
                    ...errs,
                    404: errorResponse,
                },
            },
        },
        async (req: FastifyRequest<{
 Params: { id: string };
Querystring: { scope?: string } 
}>, reply: FastifyReply) => {
            if ((await can(req, reply, 'DELETE_COURSE')) === null) return;
            const r = await remove.execute(req.params.id, req.query.scope);
            if (r.error) return fail(reply, r.error);
            return reply.send({ deleted: r.deleted });
        },
    );
}
