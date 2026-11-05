import type { PrismaClient } from '../generated/prisma/client.js';
import { deriveAuditEntity } from './audit-entity.js';
import { financeTransactionLabel } from './finance-number.js';

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function firstId(path: string): string | null {
    const m = path.match(UUID_RE);
    return m ? m[0] : null;
}

// Rótulo a partir do corpo da requisição (criação/edição costumam mandar o nome).
export function bodyLabel(body: unknown): string | null {
    if (!body || typeof body !== 'object') return null;
    const b = body as Record<string, unknown>;
    const v = b.name ?? b.title ?? b.label ?? b.username;
    return typeof v === 'string' && v.trim() ? v.trim().slice(0, 140) : null;
}

/** Usuário digitado no login, até 60 caracteres. Só lê `username` — a senha nunca. */
export function loginUsername(body: unknown): string | null {
    if (!body || typeof body !== 'object') return null;
    const v = (body as { username?: unknown }).username;
    return typeof v === 'string' && v.trim() ? v.trim().slice(0, 60) : null;
}

// Inscrição pública (/courses/:id/register*): o nome vem do corpo, não do curso.
const PUBLIC_REGISTER_RE = /^\/courses\/[^/]+\/register/i;

// Fechar o mês: o corpo traz o caixa (id) e o mês, e o rótulo é "mês · caixa".
const CLOSING_CREATE_PATH = '/admin/finance/closings';

/** Rótulo do fechamento na auditoria: "2026-10" + "BANCO" → "10/2026 · BANCO". */
export function closingAuditLabel(month: string, accountName: string | null | undefined): string {
    const [year, mm] = month.split('-');
    const when = mm ? `${mm}/${year}` : month;
    return accountName ? `${when} · ${accountName}` : when;
}

/**
 * Quais requisições buscam o nome do alvo antes de executar: edições e exclusões
 * (o alvo some numa exclusão) e as ações POST sobre um item existente
 * (iniciar curso, foto da galeria, vínculo de empresa...). Criar algo novo usa o
 * corpo; fechar o mês também, mas o nome do caixa vem do banco.
 */
export function shouldLookupTargetLabel(method: string, path: string): boolean {
    if (method === 'PATCH' || method === 'PUT' || method === 'DELETE') return true;
    if (method === 'POST' && path === CLOSING_CREATE_PATH) return true;
    return method === 'POST' && !!firstId(path) && !PUBLIC_REGISTER_RE.test(path);
}

// Criar lançamento: o Nº só existe depois de gravar, então o rótulo não vem do
// corpo (que traz a descrição, mas não o número automático) e sim da resposta.
const TRANSACTION_CREATE_PATH = '/admin/finance/transactions';

/** É a criação de um lançamento (e não a de transferência, comprovante...)? */
export function isTransactionCreate(method: string, path: string): boolean {
    return method === 'POST' && path.replace(/\/+$/, '') === TRANSACTION_CREATE_PATH;
}

/**
 * Rótulo do lançamento recém-criado a partir da resposta (201 com a linha):
 * "nº 123 — descrição". Resposta que não dá para ler → null (a trilha fica
 * "Criou um lançamento", como antes).
 */
export function createdTransactionLabel(payload: unknown): string | null {
    const text = typeof payload === 'string' ? payload : Buffer.isBuffer(payload) ? payload.toString('utf8') : null;
    if (!text) return null;
    try {
        const row = JSON.parse(text) as {
 number?: unknown;
description?: unknown 
} | null;
        if (!row || typeof row.description !== 'string' || !row.description.trim()) return null;
        const number = typeof row.number === 'number' ? row.number : null;
        return financeTransactionLabel(number, row.description.trim()).slice(0, 140);
    } catch {
        return null;
    }
}

// Editar lançamento: PATCH /admin/finance/transactions/:id (só ele; comprovante,
// transferência e as demais ações do lançamento seguem com o rótulo de antes).
const TRANSACTION_EDIT_RE = /^\/admin\/finance\/transactions\/[^/]+$/i;

/** É a edição de um lançamento? */
export function isTransactionEdit(method: string, path: string): boolean {
    return method === 'PATCH' && TRANSACTION_EDIT_RE.test(path);
}

/**
 * Rótulo do lançamento editado, com o Nº e a descrição de DEPOIS da edição.
 * Se o Nº mudou, cita o antigo: "nº 250 (antes nº 301) — descrição". `before` é
 * o rótulo de antes ("nº 301 — descrição"); sem Nº antes ou depois, só a descrição.
 */
export function editedTransactionLabel(
    before: string | null | undefined,
    after: {
 number: number | null;
description: string 
},
): string {
    const oldNumber = Number(before?.match(/^nº (\d+) — /)?.[1]);
    if (after.number != null && Number.isInteger(oldNumber) && oldNumber !== after.number) {
        return `nº ${after.number} (antes nº ${oldNumber}) — ${after.description}`.slice(0, 140);
    }
    return financeTransactionLabel(after.number, after.description).slice(0, 140);
}

/** Relê o lançamento depois da edição e monta o rótulo; falhou → null (fica o de antes). */
export async function lookupEditedTransactionLabel(
    prisma: PrismaClient,
    path: string,
    before: string | null | undefined,
): Promise<string | null> {
    const id = firstId(path);
    if (!id) return null;
    const t = await prisma.financialTransaction.findUnique({
        where: { id },
        select: { number: true,
description: true },
    });
    return t ? editedTransactionLabel(before, t) : null;
}

/** Fechar o mês: rótulo pelo corpo (ainda não validado; o caixa vem do banco). */
async function closingCreateLabel(prisma: PrismaClient, body: unknown): Promise<string | null> {
    if (!body || typeof body !== 'object') return null;
    const { accountId, month } = body as {
        accountId?: unknown;
        month?: unknown;
    };
    if (typeof accountId !== 'string' || typeof month !== 'string') return null;
    const account = await prisma.financialAccount.findUnique({
        where: { id: accountId },
        select: { name: true },
    });
    return closingAuditLabel(month, account?.name);
}

/** Lançamento do Financeiro: "nº 123 — descrição" (decisão 005); sem número, só a descrição. */
async function transactionLabel(prisma: PrismaClient, id: string): Promise<string | null> {
    const t = await prisma.financialTransaction.findUnique({
        where: { id },
        select: { number: true,
description: true },
    });
    return t ? financeTransactionLabel(t.number, t.description) : null;
}

// Busca o nome/rótulo do alvo pelo id no caminho — chamado ANTES da mutação
// (num preHandler) para capturar o nome mesmo em exclusões.
export async function lookupTargetLabel(prisma: PrismaClient, path: string, body?: unknown): Promise<string | null> {
    if (path === CLOSING_CREATE_PATH) {
        try {
            return await closingCreateLabel(prisma, body);
        } catch {
            return null;
        }
    }
    const id = firstId(path);
    if (!id) return null;
    const entity = deriveAuditEntity(path);
    const p = path.toLowerCase();
    try {
        switch (entity) {
            case 'Curso':
                return (await prisma.course.findUnique({ where: { id },
select: { name: true } }))?.name ?? null;
            case 'Inscrição':
                // /admin/courses/:id/registrations… → curso; /admin/registrations/:id… → pessoa inscrita
                if (p.startsWith('/admin/courses/')) {
                    return (await prisma.course.findUnique({ where: { id },
select: { name: true } }))?.name ?? null;
                }
                if (p.startsWith('/admin/registrations/')) {
                    return (await prisma.courseUserRegistration.findUnique({ where: { id },
select: { userData: { select: { name: true } } } }))?.userData.name ?? null;
                }
                return null;
            case 'Instrutor':
                // /admin/courses/:id/instructors… → curso; /admin/users/:id/instructor → pessoa
                if (p.startsWith('/admin/courses/')) {
                    return (await prisma.course.findUnique({ where: { id },
select: { name: true } }))?.name ?? null;
                }
                return (await prisma.userData.findUnique({ where: { id },
select: { name: true } }))?.name ?? null;
            case 'Cotação':
                return (await prisma.marketQuote.findUnique({ where: { id },
select: { label: true } }))?.label ?? null;
            case 'Empresa':
                return (await prisma.company.findUnique({ where: { id },
select: { name: true } }))?.name ?? null;
            case 'Contato público':
                return (await prisma.publicContact.findUnique({ where: { id },
select: { userData: { select: { name: true } } } }))?.userData.name ?? null;
            case 'Galeria':
                return (await prisma.galleryAlbum.findUnique({ where: { id },
select: { title: true } }))?.title ?? null;
            case 'Convênio':
                return (await prisma.convenio.findUnique({ where: { id },
select: { name: true } }))?.name ?? null;
            case 'Banner':
                return (await prisma.banner.findUnique({ where: { id },
select: { title: true } }))?.title ?? null;
            case 'Mensagem':
                return (await prisma.contactMessage.findUnique({ where: { id },
select: { name: true } }))?.name ?? null;
            case 'Reserva de sala':
                return (await prisma.roomBooking.findUnique({ where: { id },
select: { title: true } }))?.title ?? null;
            case 'Sala':
                return (await prisma.room.findUnique({ where: { id },
select: { name: true } }))?.name ?? null;
            case 'Notícia':
                return (await prisma.news.findUnique({ where: { id },
select: { title: true } }))?.title ?? null;
            case 'Regra':
                return (await prisma.rule.findUnique({ where: { id },
select: { name: true } }))?.name ?? null;
            case 'Usuário':
                return (await prisma.userData.findUnique({ where: { id },
select: { name: true } }))?.name ?? null;
            case 'Administrador':
                return (await prisma.userAdmin.findUnique({ where: { id },
select: { username: true } }))?.username ?? null;
            case 'Beneficiário Unimed':
                return (await prisma.unimedBeneficiario.findUnique({ where: { id },
select: { userData: { select: { name: true } } } }))?.userData.name ?? null;
            case 'Convite': {
                const invite = await prisma.adminInvite.findUnique({ where: { id },
select: { userDataId: true } });
                if (!invite) return null;
                return (await prisma.userData.findUnique({ where: { id: invite.userDataId },
select: { name: true } }))?.name ?? null;
            }
            case 'Categoria financeira':
                return (await prisma.financialCategory.findUnique({ where: { id },
select: { name: true } }))?.name ?? null;
            case 'Caixa':
                return (await prisma.financialAccount.findUnique({ where: { id },
select: { name: true } }))?.name ?? null;
            case 'Lançamento':
                return transactionLabel(prisma, id);
            case 'Comprovante':
                // POST /transactions/:id/attachments → lançamento; DELETE /attachments/:id → arquivo
                if (p.includes('/transactions/')) return transactionLabel(prisma, id);
                return (await prisma.financialAttachment.findUnique({ where: { id },
select: { filename: true } }))?.filename ?? null;
            case 'Fechamento de caixa': {
                // Reabrir: DELETE /admin/finance/closings/:id (o fechamento some depois).
                const closing = await prisma.financeMonthlyClosing.findUnique({
                    where: { id },
                    select: {
                        month: true,
                        account: { select: { name: true } },
                    },
                });
                return closing ? closingAuditLabel(closing.month, closing.account.name) : null;
            }
            default:
                return null;
        }
    } catch {
        return null;
    }
}
