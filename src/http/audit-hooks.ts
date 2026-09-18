import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client/extension';
import { decodeToken } from '../lib/auth.js';
import { deriveAuditEntity, loginAuditMethod, LOGIN_PATH, skipAudit } from '../lib/audit-entity.js';
import { lookupTargetLabel, bodyLabel, shouldLookupTargetLabel, loginUsername } from '../lib/audit-label.js';
import { diffSnapshots, removedSnapshot, type AuditChange } from '../lib/audit-diff.js';
import { shouldSnapshot, snapshotTarget } from '../lib/audit-snapshot.js';
import { lookupLocation } from '../lib/geoip.js';
import { requestContext } from '../lib/request-context.js';
import { maybeCleanupAuditLogs } from '../adapter/database/audit-cleanup.js';

// O que um hook deixa na request para o seguinte.
type AuditStash = {
    _auditLabel?: string | null;
    /** Registro alvo lido antes da edição/exclusão. */
    _auditBefore?: Record<string, unknown> | null;
    _auditActorId?: string | null;
    /** Linha já gravada pela rota (exportação) que ainda está sem o local. */
    _auditPendingLocation?: string;
};

const stash = (request: FastifyRequest) => request as unknown as AuditStash;
const cleanPath = (request: FastifyRequest) => (request.url ?? '').split('?')[0];
const bearer = (request: FastifyRequest) => request.headers['authorization']?.replace('Bearer ', '') ?? '';
const MUTATIONS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * A rota gravou a própria linha antes de responder (exportação): o local do IP
 * (consulta externa) é preenchido depois que a resposta sai, sem atrasar o download.
 */
export function fillAuditLocationLater(request: FastifyRequest, auditLogId: string) {
    stash(request)._auditPendingLocation = auditLogId;
}

// Tentativa bloqueada (429) já registrada por IP: não grava de novo até passar a janela.
const BLOCKED_LOGIN_WINDOW_MS = 5 * 60 * 1000;
const blockedLoginLogged = new Map<string, number>();

export function shouldLogBlockedLogin(ip: string | null, now = Date.now()): boolean {
    const key = ip ?? 'desconhecido';
    const until = blockedLoginLogged.get(key);
    if (until && until > now) return false;
    if (blockedLoginLogged.size >= 1000) {
        for (const [k, v] of blockedLoginLogged) if (v <= now) blockedLoginLogged.delete(k);
        if (blockedLoginLogged.size >= 1000) blockedLoginLogged.clear();
    }
    blockedLoginLogged.set(key, now + BLOCKED_LOGIN_WINDOW_MS);
    return true;
}

/** Usuário digitado no login se existir um admin com ele; senão "(usuário inexistente)". */
async function knownLoginUsername(prisma: PrismaClient, username: string | null): Promise<string | null> {
    if (!username) return null;
    try {
        const admin = await prisma.userAdmin.findFirst({ where: { username },
select: { id: true } });
        return admin ? username : '(usuário inexistente)';
    } catch {
        return null;
    }
}

// Trilha de auditoria. Usado pelo servidor e pelo app dos testes E2E.
export function registerAuditHooks(app: FastifyInstance, prisma: PrismaClient) {
    // Antes de editar/excluir (ou agir sobre um item, ex.: iniciar curso), captura
    // o nome do alvo (some depois numa exclusão) e o registro como estava.
    app.addHook('preHandler', async request => {
        const method = request.method;
        const path = cleanPath(request);
        if (skipAudit(path)) return;
        const wantsLabel = shouldLookupTargetLabel(method, path);
        const wantsSnapshot = shouldSnapshot(method, path);
        if (!wantsLabel && !wantsSnapshot) return;
        // Sem token válido a rota vai recusar: não consulta o banco à toa.
        const decoded = decodeToken(bearer(request));
        if (!decoded) return;
        const s = stash(request);
        s._auditActorId = decoded.userId;
        try {
            const [label, before] = await Promise.all([
                wantsLabel ? lookupTargetLabel(prisma, path) : null,
                wantsSnapshot ? snapshotTarget(prisma, method, path, decoded.userId) : null,
            ]);
            s._auditLabel = label;
            s._auditBefore = before;
        } catch {
            /* auditoria nunca deve derrubar a request */
        }
    });

    // Login com sucesso: o id do admin só existe no token que está saindo.
    app.addHook('onSend', async (request, reply, payload) => {
        if (request.method !== 'POST' || cleanPath(request) !== LOGIN_PATH || reply.statusCode !== 200) return payload;
        try {
            const token = typeof payload === 'string' ? (JSON.parse(payload) as { token?: unknown }).token : null;
            if (typeof token === 'string') stash(request)._auditActorId = decodeToken(token)?.userId ?? null;
        } catch {
            /* auditoria nunca deve derrubar a request */
        }
        return payload;
    });

    // Registra mutações bem-sucedidas e tentativas de login (quem/o quê/quando/de
    // onde). Roda após a resposta ser enviada — a consulta do local e a releitura
    // do registro nunca atrasam nem quebram a request.
    app.addHook('onResponse', async (request, reply) => {
        const method = request.method;
        const path = cleanPath(request);
        const s = stash(request);
        try {
            if (s._auditPendingLocation) {
                const location = await lookupLocation(requestContext(request).ip);
                if (location) {
                    await prisma.auditLog.update({ where: { id: s._auditPendingLocation },
data: { location } });
                }
                return;
            }

            if (method === 'POST' && path === LOGIN_PATH) {
                const loginMethod = loginAuditMethod(reply.statusCode);
                if (!loginMethod) return;
                const ctx = requestContext(request);
                // Enxurrada de tentativas bloqueadas: uma linha por IP a cada janela.
                if (loginMethod === 'LOGIN_BLOCKED' && !shouldLogBlockedLogin(ctx.ip)) return;
                await prisma.auditLog.create({
                    data: {
                        actorId: loginMethod === 'LOGIN' ? (s._auditActorId ?? null) : null,
                        method: loginMethod,
                        path,
                        entity: deriveAuditEntity(path),
                        // Só o usuário digitado (a senha nunca é lida) e só se ele existe:
                        // quem digita a senha no campo de usuário não a deixa gravada.
                        targetLabel: await knownLoginUsername(prisma, loginUsername(request.body)),
                        statusCode: reply.statusCode,
                        ...ctx,
                        location: loginMethod === 'LOGIN_BLOCKED' ? null : await lookupLocation(ctx.ip),
                    },
                });
                await maybeCleanupAuditLogs(prisma);
                return;
            }

            if (!MUTATIONS.has(method) || reply.statusCode >= 400 || skipAudit(path)) return;
            const actorId = s._auditActorId ?? decodeToken(bearer(request))?.userId ?? null;
            const targetLabel = s._auditLabel ?? bodyLabel(request.body);
            const ctx = requestContext(request);
            const [location, changes] = await Promise.all([
                lookupLocation(ctx.ip),
                auditChanges(prisma, s._auditBefore, method, path, actorId),
            ]);
            // Exclusão de reserva "e as próximas da série": mantém o ?scope=future no
            // caminho gravado (a frase da auditoria depende dele).
            const scopeFuture = method === 'DELETE'
                && /^\/admin\/room-bookings\/[^/]+$/.test(path)
                && new URLSearchParams((request.url ?? '').split('?')[1] ?? '').get('scope') === 'future';
            await prisma.auditLog.create({
                data: {
                    actorId,
                    method,
                    path: scopeFuture ? `${path}?scope=future` : path,
                    entity: deriveAuditEntity(path),
                    targetLabel,
                    statusCode: reply.statusCode,
                    ...ctx,
                    location,
                    ...(changes && { changes }),
                },
            });
            // Tempo de guarda configurado no painel: apaga o que passou do prazo
            // (no máximo uma vez por hora por processo).
            await maybeCleanupAuditLogs(prisma);
        } catch {
            /* auditoria nunca deve derrubar a aplicação */
        }
    });
}

// Campos alterados: relê o registro depois da edição; exclusão guarda o que havia.
async function auditChanges(
    prisma: PrismaClient,
    before: Record<string, unknown> | null | undefined,
    method: string,
    path: string,
    actorId: string | null,
): Promise<AuditChange[] | null> {
    if (!before) return null;
    try {
        if (method === 'DELETE') return removedSnapshot(before);
        return diffSnapshots(before, await snapshotTarget(prisma, method, path, actorId));
    } catch {
        return null;
    }
}
