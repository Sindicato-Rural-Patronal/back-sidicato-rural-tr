import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client/extension';
import { createUserAdminAdapter } from '../../adapter/database/user-admin-adapter.js';
import { createRuleAdapter } from '../../adapter/database/rule-adapter.js';
import { AUDIT_EXPORT_LIMIT, createExportAdapter } from '../../adapter/database/export-adapter.js';
import { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { EXPORT_DATASETS, ExportDataUseCase, type ExportDataset } from '../../usecase/export-data.js';
import { errorToStatus, requirePermission } from '../lib/require-permission.js';
import { errorResponse } from '../lib/swagger-schemas.js';
import { fillAuditLocationLater } from '../audit-hooks.js';
import { requestContext } from '../../lib/request-context.js';

export async function exportRouter(fastify: FastifyInstance, prisma: PrismaClient) {
    const getAdminPermissions = new GetAdminPermissionsUseCase(createUserAdminAdapter(prisma), createRuleAdapter(prisma));
    const repo = createExportAdapter(prisma);
    const exportData = new ExportDataUseCase(repo);

    const description = `Planilha CSV (\`;\`, UTF-8 com BOM) de um conjunto de dados.

- \`ids\`: só esses registros (seleção na lista ou um registro só). Lista vazia → 400.
- Sem \`ids\`: tudo o que bate com os mesmos filtros da listagem.
- **POST** recebe os parâmetros no corpo JSON (listas como array) — use para seleções grandes. **GET** aceita os mesmos na query (listas "a,b,c").

| dataset | filtros | permissão |
|---|---|---|
| people | search, memberType, memberClassification, gender, ethnicity, educationLevel, incompleteRegistration, activeMember | READ_USER |
| cadastros | (nenhum — retrato completo dos 4 tipos num arquivo só) | READ_USER_ADMIN |
| companies | search, type, isPartner | READ_USER |
| properties | ownerIds (pessoas/empresas) | READ_USER |
| admins | search, rulesId | READ_USER_ADMIN |
| courses | search, status | READ_COURSE |
| registrations | courseIds | READ_COURSE |
| contact-messages | search, read | READ_CONTACT |
| unimed | search | READ_USER |
| room-bookings | from, to (AAAA-MM-DD), roomId, type (EVENT, MEETING), search | READ_COURSE |
| audit-logs | action (create, edit, delete, export, login, login_failed), entity, actorId, ip, from, to (AAAA-MM-DD, dia em Brasília), q — no máximo ${AUDIT_EXPORT_LIMIT} linhas mais recentes | READ_AUDIT |

Cada exportação fica registrada na auditoria (ação "Exportou").`;

    const schema = (method: 'GET' | 'POST') => ({
        tags: ['Admin — Export'],
        summary: `Exportar dados em CSV (${method})`,
        description,
        security: [{ bearerAuth: [] }],
        params: {
            type: 'object',
            required: ['dataset'],
            properties: { dataset: { type: 'string',
enum: Object.keys(EXPORT_DATASETS) } },
        },
        ...(method === 'POST' && { body: { type: 'object',
additionalProperties: true } }),
        response: { 400: errorResponse,
401: errorResponse,
403: errorResponse },
    });

    async function handle(req: FastifyRequest<{ Params: { dataset: ExportDataset } }>, reply: FastifyReply, input: unknown) {
        const { dataset } = req.params;
        const actorId = await requirePermission(req, reply, EXPORT_DATASETS[dataset].permission, getAdminPermissions);
        if (actorId === null) return;

        const r = await exportData.execute(dataset, input);
        if (r.error || !r.result) return reply.status(errorToStatus(r.error)).send({ error: r.error?.message });

        try {
            const logged = await repo.logExport({
                actorId,
                path: `/admin/export/${dataset}`,
                targetLabel: r.result.auditLabel,
                ...requestContext(req),
            });
            fillAuditLocationLater(req, logged.id);
        } catch {
            /* auditoria nunca deve derrubar a exportação */
        }

        return reply
            .header('Content-Type', 'text/csv; charset=utf-8')
            .header('Content-Disposition', `attachment; filename="${r.result.filename}"`)
            .header('X-Export-Count', String(r.result.count))
            .header('Access-Control-Expose-Headers', 'Content-Disposition, X-Export-Count')
            .send(r.result.csv);
    }

    fastify.get(
        '/admin/export/:dataset',
        { schema: schema('GET') },
        (req: FastifyRequest<{ Params: { dataset: ExportDataset } }>, reply: FastifyReply) => handle(req, reply, req.query),
    );
    fastify.post(
        '/admin/export/:dataset',
        { schema: schema('POST') },
        (req: FastifyRequest<{ Params: { dataset: ExportDataset } }>, reply: FastifyReply) => handle(req, reply, req.body ?? {}),
    );
}
