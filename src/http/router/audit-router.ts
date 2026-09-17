import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client/extension';
import { createUserAdminAdapter } from '../../adapter/database/user-admin-adapter.js';
import { createRuleAdapter } from '../../adapter/database/rule-adapter.js';
import { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { requirePermission } from '../lib/require-permission.js';
import { errorResponse, paginationQuerystring, pagedResponse } from '../lib/swagger-schemas.js';
import { buildAuditLogWhere } from '../../adapter/database/list-filters.js';
import { describeAuditAction } from '../../lib/audit-sentence.js';

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
                        action: { type: 'string',
enum: ['create', 'edit', 'delete', 'export'] },
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
                    action?: 'create' | 'edit' | 'delete' | 'export';
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
