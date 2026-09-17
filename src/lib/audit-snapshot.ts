import type { PrismaClient } from '@prisma/client/extension';
import { auditRouteKey } from './audit-sentence.js';
import { SETTING_KEYS } from '../usecase/get-site-settings.js';

// Leitura do registro alvo de uma edição/exclusão, antes e depois da ação, para
// a auditoria guardar o que mudou (lib/audit-diff.ts). Só rotas que mexem em UM
// registro identificável pelo caminho (ou num conjunto fixo: configurações do
// site, cotações do dia). Nunca lê colunas binárias (ficha, comprovante).

type Row = Record<string, unknown>;
type Snapshot = (prisma: PrismaClient, ids: string[], actorId: string | null) => Promise<Row | null>;

const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function pathIds(path: string): string[] {
    return path.split('?')[0].split('/').filter(seg => UUID_SEGMENT.test(seg));
}

/** Troca ids de relação pelo nome (roomId → room: "SALA 1"). */
function named(row: Row | null, names: Record<string, unknown>, drop: string[]): Row | null {
    if (!row) return null;
    const out: Row = { ...row };
    for (const key of drop) delete out[key];
    for (const key of Object.keys(names)) delete out[key];
    return { ...out,
...names };
}

type AddressLike = Partial<Record<'street' | 'number' | 'neighborhood' | 'localityName' | 'road' | 'km' | 'city' | 'state' | 'zipCode' | 'complement', string | null>>;

export function addressText(a: AddressLike | null | undefined): string | null {
    if (!a) return null;
    const parts = [
        [a.street, a.number].filter(Boolean).join(', '),
        a.complement,
        a.neighborhood,
        a.localityName,
        [a.road, a.km ? `km ${a.km}` : null].filter(Boolean).join(' '),
        [a.city, a.state].filter(Boolean).join('/'),
        a.zipCode ? `CEP ${a.zipCode}` : null,
    ].filter(Boolean);
    return parts.length ? parts.join(' - ') : null;
}

function brl(cents: number | null | undefined): string | null {
    if (typeof cents !== 'number') return null;
    return (cents / 100).toLocaleString('pt-BR', { style: 'currency',
currency: 'BRL' }).replace(/\s/g, ' ');
}

const byFirstId = (model: string, args: Row = {}): Snapshot => (prisma, ids) =>
    prisma[model].findUnique({ where: { id: ids[0] },
...args });
const byLastId = (model: string, args: Row = {}): Snapshot => (prisma, ids) =>
    prisma[model].findUnique({ where: { id: ids[ids.length - 1] },
...args });

const nameOnly = { select: { name: true } };

const course: Snapshot = async (prisma, ids) => {
    const c = await prisma.course.findUnique({ where: { id: ids[0] },
include: { room: nameOnly } });
    return named(c, { room: c?.room?.name ?? null }, ['roomId']);
};

const registration: Snapshot = async (prisma, ids) => {
    const r = await prisma.courseUserRegistration.findUnique({
        where: { id: ids[0] },
        include: { userData: nameOnly,
course: nameOnly },
    });
    return named(r, { person: r?.userData?.name ?? null,
course: r?.course?.name ?? null }, ['userDataId', 'courseId', 'userData']);
};

const property: Snapshot = async (prisma, ids) => {
    const p = await prisma.property.findUnique({ where: { id: ids[ids.length - 1] },
include: { address: true } });
    return named(p, { address: addressText(p?.address) }, ['addressId', 'userDataId', 'companyId']);
};

const admin = (id: string | null | undefined, prisma: PrismaClient) =>
    id
        ? prisma.userAdmin
              .findUnique({ where: { id },
include: { rules: nameOnly,
userData: nameOnly } })
              .then((a: (Row & {
                  rules?: { name: string } | null;
                  userData?: { name: string } | null;
              }) | null) => named(a, { name: a?.userData?.name ?? null,
rule: a?.rules?.name ?? null }, ['rulesId', 'userDataId', 'rules', 'userData']))
        : Promise.resolve(null);

// Chave: caminho com os ids trocados por ":id" (mesma de lib/audit-sentence.ts).
const SNAPSHOTS: Record<string, Snapshot> = {
    // Pessoas, administradores, regras e instrutores
    '/users/:id': byFirstId('userData'),
    '/admin/users/:id': (prisma, ids) => admin(ids[0], prisma),
    '/admin/me': (prisma, _ids, actorId) => admin(actorId, prisma),
    '/rules/:id': byFirstId('rule'),
    '/admin/users/:id/instructor': (prisma, ids) => prisma.userInstructor.findUnique({ where: { userDataId: ids[0] } }),
    '/admin/users/:id/properties/:id': property,
    '/admin/users/:id/relations/:id': async (prisma, ids) => {
        const r = await prisma.userRelation.findUnique({ where: { id: ids[1] },
include: { target: nameOnly } });
        return named(r, { person: r?.target?.name ?? null }, ['sourceId', 'targetId', 'target']);
    },
    '/admin/unimed/:id': async (prisma, ids) => {
        const u = await prisma.unimedBeneficiario.findUnique({ where: { id: ids[0] },
include: { userData: nameOnly } });
        return named(u, { person: u?.userData?.name ?? null }, ['userDataId', 'userData']);
    },
    '/admin/invites/:id': async (prisma, ids) => {
        // Sem o token do convite.
        const i = await prisma.adminInvite.findUnique({ where: { id: ids[0] },
select: { userDataId: true,
rulesId: true,
expiresAt: true,
usedAt: true } });
        if (!i) return null;
        const [person, rule] = await Promise.all([
            prisma.userData.findUnique({ where: { id: i.userDataId },
...nameOnly }),
            prisma.rule.findUnique({ where: { id: i.rulesId },
...nameOnly }),
        ]);
        return { person: person?.name ?? null,
rule: rule?.name ?? null,
expiresAt: i.expiresAt,
usedAt: i.usedAt };
    },

    // Empresas
    '/admin/companies/:id': async (prisma, ids) => {
        const c = await prisma.company.findUnique({ where: { id: ids[0] },
include: { address: true } });
        return named(c, { address: addressText(c?.address) }, ['addressId']);
    },
    '/admin/companies/:id/members/:id': async (prisma, ids) => {
        const m = await prisma.companyMember.findUnique({ where: { id: ids[1] },
include: { userData: nameOnly } });
        return named(m, { person: m?.userData?.name ?? null }, ['userDataId', 'companyId', 'userData']);
    },
    '/admin/companies/:id/properties/:id': property,

    // Cursos e inscrições
    '/courses/:id': course,
    '/admin/courses/:id/complete': course,
    '/courses/:id/gallery/:id': byLastId('coursePhoto', { select: { url: true,
caption: true } }),
    '/admin/courses/:id/instructors/:id': async (prisma, ids) => {
        const a = await prisma.courseInstructor.findUnique({
            where: { id: ids[1] },
            include: { instructor: { select: { userData: nameOnly } } },
        });
        return named(a, { instructor: a?.instructor?.userData?.name ?? null }, ['instructorId', 'courseId']);
    },
    '/admin/registrations/:id': registration,
    '/admin/registrations/:id/confirm': registration,
    '/admin/registrations/:id/attendance': registration,
    '/admin/registrations/:id/ficha': (prisma, ids) =>
        prisma.registrationFicha.findUnique({ where: { registrationId: ids[0] },
select: { filename: true,
mimeType: true } }),
    '/rooms/:id': byFirstId('room'),

    // Site
    '/admin/banners/:id': byFirstId('banner'),
    '/news/:id': byFirstId('news'),
    '/admin/convenios/:id': byFirstId('convenio'),
    '/admin/galleries/:id': byFirstId('galleryAlbum'),
    '/admin/galleries/:id/photos/:id': byLastId('galleryPhoto', { select: { url: true,
caption: true,
order: true } }),
    '/admin/public-contacts/:id': async (prisma, ids) => {
        const p = await prisma.publicContact.findUnique({ where: { id: ids[0] },
include: { userData: nameOnly } });
        return named(p, { person: p?.userData?.name ?? null }, ['userDataId', 'userData']);
    },
    '/admin/contacts/messages/:id': byFirstId('contactMessage'),
    '/admin/contacts/messages/:id/unread': byFirstId('contactMessage'),
    '/admin/site-settings': async prisma => {
        const rows: {
            key: string;
            value: string;
        }[] = await prisma.siteSetting.findMany();
        // Nome do campo da API (orgPhone) no lugar da chave interna (org.phone).
        const fieldByKey = new Map<string, string>(Object.entries(SETTING_KEYS).map(([field, key]) => [key, field]));
        return Object.fromEntries(rows.map(r => [fieldByKey.get(r.key) ?? r.key, r.value]));
    },

    // Cotações
    '/admin/market-quotes/:id': byFirstId('marketQuote'),
    '/admin/market-quotes/source': async prisma => {
        const row = await prisma.siteSetting.findUnique({ where: { key: SETTING_KEYS.quotesSource } });
        return { quotesSource: row?.value ?? null };
    },
    '/admin/market-quotes/daily': async prisma => {
        const quotes: {
            label: string;
            priceCents: number | null;
            period: string | null;
            referenceDate: Date | null;
        }[] = await prisma.marketQuote.findMany({ orderBy: { order: 'asc' } });
        // Um campo por produto: "R$ 120,00 · 17/09/2026 · manhã".
        const period = (p: string | null) => (p === 'MORNING' ? 'manhã' : p === 'AFTERNOON' ? 'tarde' : null);
        const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10).split('-').reverse().join('/') : null);
        return Object.fromEntries(quotes.map(q => [
            q.label,
            [brl(q.priceCents), day(q.referenceDate), period(q.period)].filter(Boolean).join(' · ') || null,
        ]));
    },

    // Financeiro
    '/admin/finance/categories/:id': byFirstId('financialCategory'),
    '/admin/finance/accounts/:id': byFirstId('financialAccount'),
    '/admin/finance/transactions/:id': async (prisma, ids) => {
        const t = await prisma.financialTransaction.findUnique({
            where: { id: ids[0] },
            include: { category: nameOnly,
account: nameOnly },
        });
        return named(t, { category: t?.category?.name ?? null,
account: t?.account?.name ?? null }, ['categoryId', 'accountId']);
    },
    '/admin/finance/attachments/:id': byFirstId('financialAttachment', { select: { filename: true,
mimeType: true,
size: true } }),
};

function snapshotFor(method: string, path: string): Snapshot | null {
    if (method !== 'PATCH' && method !== 'PUT' && method !== 'DELETE') return null;
    const key = auditRouteKey(method, path).slice(method.length + 1);
    return SNAPSHOTS[key] ?? null;
}

/** Esta edição/exclusão tem leitura de antes/depois? */
export function shouldSnapshot(method: string, path: string): boolean {
    return snapshotFor(method.toUpperCase(), path) !== null;
}

/** Registro alvo agora (null se a rota não é mapeada, o registro não existe ou deu erro). */
export async function snapshotTarget(
    prisma: PrismaClient,
    method: string,
    path: string,
    actorId: string | null,
): Promise<Record<string, unknown> | null> {
    const snapshot = snapshotFor(method.toUpperCase(), path);
    if (!snapshot) return null;
    try {
        return (await snapshot(prisma, pathIds(path), actorId)) ?? null;
    } catch {
        return null;
    }
}
