import type { PrismaClient } from '@prisma/client/extension';
import { deriveAuditEntity } from './audit-entity.js';

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

// Busca o nome/rótulo do alvo pelo id no caminho — chamado ANTES da mutação
// (num preHandler) para capturar o nome mesmo em exclusões.
export async function lookupTargetLabel(prisma: PrismaClient, path: string): Promise<string | null> {
    const id = firstId(path);
    if (!id) return null;
    const entity = deriveAuditEntity(path);
    try {
        switch (entity) {
            case 'Curso':
                return (await prisma.course.findUnique({ where: { id },
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
            case 'Categoria financeira':
                return (await prisma.financialCategory.findUnique({ where: { id },
select: { name: true } }))?.name ?? null;
            case 'Caixa':
                return (await prisma.financialAccount.findUnique({ where: { id },
select: { name: true } }))?.name ?? null;
            case 'Lançamento':
                return (await prisma.financialTransaction.findUnique({ where: { id },
select: { description: true } }))?.description ?? null;
            default:
                return null;
        }
    } catch {
        return null;
    }
}
