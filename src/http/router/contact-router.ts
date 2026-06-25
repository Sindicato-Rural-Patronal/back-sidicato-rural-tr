import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@prisma/client/extension';
import { createContactMessageAdapter } from '../../adapter/database/contact-message-adapter.js';
import { createUserAdminAdapter } from '../../adapter/database/user-admin-adapter.js';
import { createRuleAdapter } from '../../adapter/database/rule-adapter.js';
import { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { CreateContactMessageUseCase } from '../../usecase/create-contact-message.js';
import { ListContactMessagesUseCase } from '../../usecase/list-contact-messages.js';
import { MarkContactMessageReadUseCase } from '../../usecase/mark-contact-message-read.js';
import { CreateContactMessageController } from '../controllers/create-contact-message.js';
import { ListContactMessagesController } from '../controllers/list-contact-messages.js';
import { MarkContactMessageReadController } from '../controllers/mark-contact-message-read.js';
import { DeleteContactMessageController } from '../controllers/delete-contact-message.js';
import { DeleteContactMessageUseCase } from '../../usecase/delete-contact-message.js';
import { requirePermission } from '../lib/require-permission.js';

export async function contactRouter(fastify: FastifyInstance, prisma: PrismaClient) {
    const repo = createContactMessageAdapter(prisma);
    const userAdminRepository = createUserAdminAdapter(prisma);
    const ruleRepository = createRuleAdapter(prisma);
    const getAdminPermissions = new GetAdminPermissionsUseCase(userAdminRepository, ruleRepository);

    const createController = new CreateContactMessageController(new CreateContactMessageUseCase(repo));
    const listController = new ListContactMessagesController(new ListContactMessagesUseCase(repo));
    const markReadController = new MarkContactMessageReadController(new MarkContactMessageReadUseCase(repo));
    const deleteController = new DeleteContactMessageController(new DeleteContactMessageUseCase(repo));

    fastify.post(
        '/contacts/message',
        {
            schema: {
                tags: ['Contatos — Formulário'],
                summary: 'Enviar mensagem de contato',
                description: 'Endpoint público para envio de mensagens pelo formulário de contato.',
                body: {
                    type: 'object',
                    required: ['name', 'email', 'message'],
                    properties: {
                        name: { type: 'string',
maxLength: 100,
example: 'Maria Oliveira' },
                        email: { type: 'string',
format: 'email',
maxLength: 150,
example: 'maria@example.com' },
                        phone: { type: 'string',
maxLength: 50,
nullable: true,
example: '44999990002' },
                        subject: { type: 'string',
maxLength: 50,
nullable: true,
example: 'Dúvida sobre inscrição' },
                        message: { type: 'string',
minLength: 1,
maxLength: 2000,
example: 'Gostaria de saber mais informações sobre o próximo curso de manejo.' },
                    },
                },
                response: {
                    201: {
                        type: 'object',
                        properties: {
                            id: { type: 'string' },
                            createdAt: { type: 'string',
format: 'date-time' },
                        },
                    },
                    400: { type: 'object',
properties: { error: { type: 'string' } } },
                },
            },
        },
        (req: FastifyRequest, res: FastifyReply) =>
            createController.handle(req as Parameters<typeof createController.handle>[0], res),
    );

    fastify.get(
        '/admin/contacts/messages',
        {
            schema: {
                tags: ['Contatos — Admin'],
                summary: 'Listar mensagens de contato',
                security: [{ bearerAuth: [] }],
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
                        read: { type: 'boolean',
description: 'Filtrar por status de leitura' },
                        search: { type: 'string',
description: 'Busca por nome, email ou assunto' },
                    },
                },
                response: {
                    200: {
                        type: 'object',
                        properties: {
                            data: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        id: { type: 'string' },
                                        name: { type: 'string' },
                                        email: { type: 'string' },
                                        phone: { type: 'string',
nullable: true },
                                        subject: { type: 'string',
nullable: true },
                                        message: { type: 'string' },
                                        read: { type: 'boolean' },
                                        createdAt: { type: 'string',
format: 'date-time' },
                                    },
                                },
                            },
                            total: { type: 'integer' },
                            page: { type: 'integer' },
                            limit: { type: 'integer' },
                            totalPages: { type: 'integer' },
                        },
                    },
                    401: { type: 'object',
properties: { error: { type: 'string' } } },
                    403: { type: 'object',
properties: { error: { type: 'string' } } },
                },
            },
        },
        async (req: FastifyRequest, res: FastifyReply) => {
            const userId = await requirePermission(req, res, 'READ_CONTACT', getAdminPermissions);
            if (!userId) return;
            return listController.handle(req as Parameters<typeof listController.handle>[0], res);
        },
    );

    fastify.patch(
        '/admin/contacts/messages/:messageId',
        {
            schema: {
                tags: ['Contatos — Admin'],
                summary: 'Marcar mensagem como lida',
                security: [{ bearerAuth: [] }],
                params: {
                    type: 'object',
                    required: ['messageId'],
                    properties: { messageId: { type: 'string' } },
                },
                body: {
                    type: 'object',
                    properties: { read: { type: 'boolean' } },
                },
                response: {
                    200: { type: 'object',
properties: { message: { type: 'string' } } },
                    401: { type: 'object',
properties: { error: { type: 'string' } } },
                    403: { type: 'object',
properties: { error: { type: 'string' } } },
                    404: { type: 'object',
properties: { error: { type: 'string' } } },
                },
            },
        },
        async (req: FastifyRequest, res: FastifyReply) => {
            const userId = await requirePermission(req, res, 'UPDATE_CONTACT', getAdminPermissions);
            if (!userId) return;
            return markReadController.handle(req as Parameters<typeof markReadController.handle>[0], res);
        },
    );

    fastify.delete(
        '/admin/contacts/messages/:messageId',
        {
            schema: {
                tags: ['Contatos — Admin'],
                summary: 'Excluir mensagem de contato',
                security: [{ bearerAuth: [] }],
                params: {
                    type: 'object',
                    required: ['messageId'],
                    properties: { messageId: { type: 'string' } },
                },
                response: {
                    204: { type: 'null' },
                    401: { type: 'object',
properties: { error: { type: 'string' } } },
                    403: { type: 'object',
properties: { error: { type: 'string' } } },
                    404: { type: 'object',
properties: { error: { type: 'string' } } },
                },
            },
        },
        async (req: FastifyRequest, res: FastifyReply) => {
            const userId = await requirePermission(req, res, 'UPDATE_CONTACT', getAdminPermissions);
            if (!userId) return;
            return deleteController.handle(req as Parameters<typeof deleteController.handle>[0], res);
        },
    );
}
