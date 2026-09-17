import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client/extension';
import { createUserAdminAdapter } from '../../adapter/database/user-admin-adapter.js';
import { createRuleAdapter } from '../../adapter/database/rule-adapter.js';
import { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { requirePermission } from '../lib/require-permission.js';
import { errorResponse, paginationQuerystring, pagedResponse } from '../lib/swagger-schemas.js';
import { buildAuditLogWhere } from '../../adapter/database/list-filters.js';
import { describeAuditAction } from '../../lib/audit-sentence.js';
import { describeUserAgent } from '../../lib/user-agent.js';

// Valor de antes/depois: texto, número, sim/não ou vazio.
const auditValue = { type: ['string', 'number', 'boolean', 'null'] };

export async function auditRouter(fastify: FastifyInstance, prisma: PrismaClient) {
    const userAdminRepository = createUserAdminAdapter(prisma);
    const ruleRepository = createRuleAdapter(prisma);
    const getAdminPermissions = new GetAdminPermissionsUseCase(userAdminRepository, ruleRepository);

    fastify.get(
        '/admin/audit-logs',
        {
            schema: {
                tags: ['Admin — Audit'],
                summary: 'List admin audit trail',
                security: [{ bearerAuth: [] }],
                querystring: {
                    type: 'object',
                    properties: {
                        ...paginationQuerystring.properties,
                        // login = entradas no painel; login_failed = senha errada ou bloqueio por excesso de tentativas
                        action: { type: 'string',
enum: ['create', 'edit', 'delete', 'export', 'login', 'login_failed'] },
                        ip: { type: 'string',
description: 'IP exato' },
                        entity: { type: 'string' },
                        actorId: { type: 'string' },
                        from: { type: 'string' },
                        to: { type: 'string' },
                        q: { type: 'string' },
                    },
                },
                response: {
                    200: pagedResponse({
                        type: 'object',
                        properties: {
                            id: { type: 'string' },
                            actorId: { type: 'string',
nullable: true },
                            actorName: { type: 'string' },
                            method: { type: 'string' },
                            path: { type: 'string' },
                            entity: { type: 'string' },
                            targetLabel: { type: 'string',
nullable: true },
                            // Frase pronta ("Iniciou o curso "HORTA"") — lib/audit-sentence.ts
                            summary: { type: 'string' },
                            statusCode: { type: 'integer' },
                            // De onde veio (linhas antigas: null)
                            ip: { type: 'string',
nullable: true },
                            location: { type: 'string',
nullable: true },
                            // Rótulo curto do User-Agent ("Chrome no Windows"); null sem User-Agent
                            device: { type: 'string',
nullable: true },
                            userAgent: { type: 'string',
nullable: true },
                            // Campos alterados (edição) ou do registro removido (exclusão)
                            changes: {
                                type: 'array',
                                nullable: true,
                                items: {
                                    type: 'object',
                                    properties: {
                                        field: { type: 'string' },
                                        before: auditValue,
                                        after: auditValue,
                                    },
                                },
                            },
                            createdAt: { type: 'string' },
                        },
                    }),
                    401: errorResponse,
                    403: errorResponse,
                },
            },
        },
        async (
            req: FastifyRequest<{
                Querystring: {
                    page?: number;
limit?: number;
                    action?: 'create' | 'edit' | 'delete' | 'export' | 'login' | 'login_failed';
                    ip?: string;
                    entity?: string;
actorId?: string;
from?: string;
to?: string;
q?: string;
                };
            }>,
            res: FastifyReply,
        ) => {
            if (!(await requirePermission(req, res, 'READ_AUDIT', getAdminPermissions))) return;
            const page = Number(req.query.page) || 1;
            const limit = Number(req.query.limit) || 30;
            const skip = (page - 1) * limit;

            // Filtros opcionais (mesmos da exportação).
            const where = buildAuditLogWhere(req.query);

            type AuditRow = {
                id: string;
                actorId: string | null;
                method: string;
                path: string;
                entity: string;
                targetLabel: string | null;
                statusCode: number;
                ip: string | null;
                userAgent: string | null;
                location: string | null;
                changes: unknown;
                createdAt: Date;
            };
            const [rows, total]: [AuditRow[], number] = await Promise.all([
                prisma.auditLog.findMany({ where,
orderBy: { createdAt: 'desc' },
skip,
take: limit }),
                prisma.auditLog.count({ where }),
            ]);

            const ids = [...new Set(rows.map(r => r.actorId).filter(Boolean))] as string[];
            const admins: {
 id: string;
username: string 
}[] = ids.length
                ? await prisma.userAdmin.findMany({
                      where: { id: { in: ids } },
                      select: { id: true,
username: true },
                  })
                : [];
            const nameById = new Map(admins.map(a => [a.id, a.username]));
            const data = rows.map(r => ({
                ...r,
                actorName: r.actorId ? (nameById.get(r.actorId) ?? '—') : 'Público',
                summary: describeAuditAction(r),
                device: r.userAgent ? describeUserAgent(r.userAgent) : null,
                changes: Array.isArray(r.changes) ? r.changes : null,
            }));

            return res.send({
                data,
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit) || 1,
            });
        },
    );
}
