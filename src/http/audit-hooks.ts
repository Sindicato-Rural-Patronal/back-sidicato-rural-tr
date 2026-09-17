import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client/extension';
import { decodeToken } from '../lib/auth.js';
import { deriveAuditEntity } from '../lib/audit-entity.js';
import { lookupTargetLabel, bodyLabel } from '../lib/audit-label.js';

// Trilha de auditoria. Usado pelo servidor e pelo app dos testes E2E.
export function registerAuditHooks(app: FastifyInstance, prisma: PrismaClient) {
    // Antes de editar/excluir, captura o nome do alvo (some depois numa exclusão).
    app.addHook('preHandler', async request => {
        const m = request.method;
        if (m !== 'PATCH' && m !== 'PUT' && m !== 'DELETE') return;
        const path = (request.url ?? '').split('?')[0];
        try {
            (request as { _auditLabel?: string | null })._auditLabel = await lookupTargetLabel(prisma, path);
        } catch {
            /* auditoria nunca deve derrubar a request */
        }
    });

    // Registra mutações bem-sucedidas (quem/o quê/quando). Roda após a resposta
    // ser enviada — nunca atrasa nem quebra a request.
    app.addHook('onResponse', async (request, reply) => {
        const method = request.method;
        if (method !== 'POST' && method !== 'PATCH' && method !== 'PUT' && method !== 'DELETE') return;
        if (reply.statusCode >= 400) return;
        const path = (request.url ?? '').split('?')[0];
        if (path === '/auth/login') return; // ruído + sem ator
        if (path.startsWith('/invites/')) return; // não persistir o token de convite
        if (path.startsWith('/admin/export/')) return; // a exportação registra a própria linha ("Exportou")
        try {
            const token = request.headers['authorization']?.replace('Bearer ', '') ?? '';
            const decoded = decodeToken(token);
            const stashed = (request as { _auditLabel?: string | null })._auditLabel ?? null;
            const targetLabel = stashed ?? bodyLabel(request.body);
            await prisma.auditLog.create({
                data: {
                    actorId: decoded?.userId ?? null,
                    method,
                    path,
                    entity: deriveAuditEntity(path),
                    targetLabel,
                    statusCode: reply.statusCode,
                },
            });
        } catch {
            /* auditoria nunca deve derrubar a aplicação */
        }
    });
}
