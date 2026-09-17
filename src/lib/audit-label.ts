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

// Inscrição pública (/courses/:id/register*): o nome vem do corpo, não do curso.
const PUBLIC_REGISTER_RE = /^\/courses\/[^/]+\/register/i;

/**
 * Quais requisições buscam o nome do alvo antes de executar: edições e exclusões
 * (o alvo some numa exclusão) e as ações POST sobre um item existente
 * (iniciar curso, foto da galeria, vínculo de empresa...). Criar algo novo usa o corpo.
 */
export function shouldLookupTargetLabel(method: string, path: string): boolean {
    if (method === 'PATCH' || method === 'PUT' || method === 'DELETE') return true;
    return method === 'POST' && !!firstId(path) && !PUBLIC_REGISTER_RE.test(path);
}

// Busca o nome/rótulo do alvo pelo id no caminho — chamado ANTES da mutação
// (num preHandler) para capturar o nome mesmo em exclusões.
export async function lookupTargetLabel(prisma: PrismaClient, path: string): Promise<string | null> {
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
                return (await prisma.financialTransaction.findUnique({ where: { id },
select: { description: true } }))?.description ?? null;
            case 'Comprovante':
                // POST /transactions/:id/attachments → lançamento; DELETE /attachments/:id → arquivo
                if (p.includes('/transactions/')) {
                    return (await prisma.financialTransaction.findUnique({ where: { id },
select: { description: true } }))?.description ?? null;
                }
                return (await prisma.financialAttachment.findUnique({ where: { id },
select: { filename: true } }))?.filename ?? null;
            default:
                return null;
        }
    } catch {
        return null;
    }
}
