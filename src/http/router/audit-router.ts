import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client/extension';
import { createUserAdminAdapter } from '../../adapter/database/user-admin-adapter.js';
import { createRuleAdapter } from '../../adapter/database/rule-adapter.js';
import { createSiteSettingsAdapter } from '../../adapter/database/site-settings-adapter.js';
import { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import {
    AUDIT_RETENTION_OPTIONS,
    GetAuditRetentionUseCase,
    UpdateAuditRetentionUseCase,
} from '../../usecase/audit-retention.js';
import { purgeOldAuditLogs, resetAuditCleanupClock } from '../../adapter/database/audit-cleanup.js';
import { requirePermission, errorToStatus } from '../lib/require-permission.js';
import { errorResponse, paginationQuerystring, pagedResponse } from '../lib/swagger-schemas.js';
import { buildAuditLogWhere } from '../../adapter/database/list-filters.js';
import { describeAuditAction } from '../../lib/audit-sentence.js';
import { describeUserAgent } from '../../lib/user-agent.js';

// Valor de antes/depois: texto, número, sim/não ou vazio.
const auditValue = { type: ['string', 'number', 'boolean', 'null'] };

// Resposta de GET/PATCH /admin/audit-settings.
const auditSettingsResponse = {
    type: 'object',
    properties: {
        // 0 = guardar para sempre.
        retentionDays: { type: 'integer' },
        options: { type: 'array',
items: { type: 'integer' } },
        // Data do registro mais antigo guardado (null = trilha vazia).
        oldestAt: { type: 'string',
nullable: true },
        total: { type: 'integer' },
        // Só no PATCH: quantas linhas a mudança já apagou.
        deleted: { type: 'integer' },
    },
};

export async function auditRouter(fastify: FastifyInstance, prisma: PrismaClient) {
    const userAdminRepository = createUserAdminAdapter(prisma);
    const ruleRepository = createRuleAdapter(prisma);
    const getAdminPermissions = new GetAdminPermissionsUseCase(userAdminRepository, ruleRepository);
    const siteSettingsRepository = createSiteSettingsAdapter(prisma);
    const getAuditRetention = new GetAuditRetentionUseCase(siteSettingsRepository);
    const updateAuditRetention = new UpdateAuditRetentionUseCase(siteSettingsRepository);

    /** Registro mais antigo guardado + total, para a tela de configuração. */
    async function trailExtent(): Promise<{
 oldestAt: string | null;
total: number
}> {
        const [oldest, total]: [{ createdAt: Date } | null, number] = await Promise.all([
            prisma.auditLog.findFirst({ orderBy: { createdAt: 'asc' },
select: { createdAt: true } }),
            prisma.auditLog.count(),
        ]);
        return { oldestAt: oldest ? oldest.createdAt.toISOString() : null,
total };
    }

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

    // Configuração da trilha: por quanto tempo os registros ficam guardados.
    fastify.get(
        '/admin/audit-settings',
        {
            schema: {
                tags: ['Admin — Audit'],
                summary: 'Tempo de guarda da trilha de auditoria',
                security: [{ bearerAuth: [] }],
                response: {
 200: auditSettingsResponse,
401: errorResponse,
403: errorResponse
},
            },
        },
        async (req: FastifyRequest, res: FastifyReply) => {
            if (!(await requirePermission(req, res, 'READ_AUDIT', getAdminPermissions))) return;
            const [{ retentionDays }, extent] = await Promise.all([
                getAuditRetention.execute(),
                trailExtent(),
            ]);
            return res.send({
 retentionDays,
options: [...AUDIT_RETENTION_OPTIONS],
...extent
});
        },
    );

    fastify.patch(
        '/admin/audit-settings',
        {
            schema: {
                tags: ['Admin — Audit'],
                summary: 'Mudar o tempo de guarda da trilha (apaga o que passou do prazo)',
                security: [{ bearerAuth: [] }],
                body: {
                    type: 'object',
                    required: ['retentionDays'],
                    // 0 = para sempre; senão de 30 a 3650 dias.
                    properties: { retentionDays: { type: 'integer',
minimum: 0,
maximum: 3650 } },
                },
                response: {
                    200: auditSettingsResponse,
                    400: errorResponse,
                    401: errorResponse,
                    403: errorResponse,
                },
            },
        },
        async (req: FastifyRequest<{ Body: { retentionDays?: number } }>, res: FastifyReply) => {
            if (!(await requirePermission(req, res, 'UPDATE_AUDIT', getAdminPermissions))) return;
            const result = await updateAuditRetention.execute(req.body);
            if (result.error) {
                return res.status(errorToStatus(result.error)).send({ error: result.error.message });
            }
            const retentionDays = result.retentionDays ?? 0;
            // Aplica na hora (a limpeza de rotina só roda de hora em hora) e
            // reinicia a janela para não varrer duas vezes seguidas.
            let deleted = 0;
            try {
                deleted = await purgeOldAuditLogs(prisma, retentionDays);
                resetAuditCleanupClock(Date.now());
            } catch {
                /* a limpeza tenta de novo na próxima gravação */
            }
            return res.send({
                retentionDays,
                options: [...AUDIT_RETENTION_OPTIONS],
                deleted,
                ...(await trailExtent()),
            });
        },
    );
}
