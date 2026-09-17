import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client/extension';
import { createUserAdminAdapter } from '../../adapter/database/user-admin-adapter.js';
import { createRuleAdapter } from '../../adapter/database/rule-adapter.js';
import { createExportAdapter } from '../../adapter/database/export-adapter.js';
import { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { EXPORT_DATASETS, ExportDataUseCase, type ExportDataset } from '../../usecase/export-data.js';
import { errorToStatus, requirePermission } from '../lib/require-permission.js';
import { errorResponse } from '../lib/swagger-schemas.js';

export async function exportRouter(fastify: FastifyInstance, prisma: PrismaClient) {
    const getAdminPermissions = new GetAdminPermissionsUseCase(createUserAdminAdapter(prisma), createRuleAdapter(prisma));
    const repo = createExportAdapter(prisma);
    const exportData = new ExportDataUseCase(repo);

    fastify.get(
        '/admin/export/:dataset',
        {
            schema: {
                tags: ['Admin — Export'],
                summary: 'Exportar dados em CSV (Excel)',
                description: `Planilha CSV (\`;\`, UTF-8 com BOM) de um conjunto de dados.

- \`ids=a,b,c\`: só esses registros (seleção na lista ou um registro só).
- Sem \`ids\`: tudo o que bate com os mesmos filtros da listagem.

| dataset | filtros | permissão |
|---|---|---|
| people | search, memberType, memberClassification, gender, ethnicity, educationLevel, incompleteRegistration | READ_USER |
| companies | search, type, isPartner | READ_USER |
| properties | ownerIds (pessoas/empresas) | READ_USER |
| admins | search, rulesId | READ_USER_ADMIN |
| courses | search, status | READ_COURSE |
| registrations | courseIds | READ_COURSE |
| contact-messages | search, read | READ_CONTACT |
| unimed | search | READ_USER |
| audit-logs | action, entity, actorId, from, to, q | READ_AUDIT |

Cada exportação fica registrada na auditoria (ação "Exportou").`,
                security: [{ bearerAuth: [] }],
                params: {
                    type: 'object',
                    required: ['dataset'],
                    properties: { dataset: { type: 'string',
enum: Object.keys(EXPORT_DATASETS) } },
                },
                response: { 400: errorResponse,
401: errorResponse,
403: errorResponse },
            },
        },
        async (req: FastifyRequest<{ Params: { dataset: ExportDataset } }>, reply: FastifyReply) => {
            const { dataset } = req.params;
            const actorId = await requirePermission(req, reply, EXPORT_DATASETS[dataset].permission, getAdminPermissions);
            if (actorId === null) return;

            const r = await exportData.execute(dataset, req.query);
            if (r.error || !r.result) return reply.status(errorToStatus(r.error)).send({ error: r.error?.message });

            try {
                await repo.logExport({ actorId,
path: `/admin/export/${dataset}`,
targetLabel: r.result.auditLabel });
            } catch {
                /* auditoria nunca deve derrubar a exportação */
            }

            return reply
                .header('Content-Type', 'text/csv; charset=utf-8')
                .header('Content-Disposition', `attachment; filename="${r.result.filename}"`)
                .header('X-Export-Count', String(r.result.count))
                .header('Access-Control-Expose-Headers', 'Content-Disposition, X-Export-Count')
                .send(r.result.csv);
        },
    );
}
