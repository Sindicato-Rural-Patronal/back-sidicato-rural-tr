import type { UserListFilters } from '../../ports/external/user-data-repository.js';
import type { CompanyListFilters } from '../../ports/external/company-repository.js';
import type { CourseListFilters } from '../../ports/external/course-repository.js';
import type { UserAdminListFilters } from '../../ports/external/user-admin-repository.js';
import type { ContactMessageFilters } from '../../ports/external/contact-message-repository.js';
import type { AuditLogFilters } from '../../ports/external/export-repository.js';
import { stripAccents } from '../../lib/text.js';

// Filtros das listagens do painel. Ficam aqui para a exportação usar exatamente
// os mesmos filtros da tela (o que se vê na lista é o que sai na planilha).

// ── Busca por texto ──────────────────────────────────────────────────────────
// Sem diferenciar acento nem maiúscula: "joao" acha "João" e "João" acha "JOAO".
// Nomes são comparados nas colunas *Search (nameSearch, tradeNameSearch), que um
// trigger do banco preenche com immutable_unaccent_lower() — a mesma regra do
// searchKey(). O nome original também entra no OR (letra fora da tabela de
// acentos do SQL ainda casa quando digitada igual).

/** Termo da busca como fica nas colunas *Search: minúsculo e sem acento. */
export function searchKey(value: string): string {
    return stripAccents(value).toLowerCase();
}

type TextSearch = {
    term: string;
    key: string;
    /** Dígitos do termo quando ele parece um documento (só números, ponto, traço, barra); senão ''. */
    docDigits: string;
};

/** Termo aparado + chave sem acento + dígitos de documento; null se a busca está vazia. */
function textSearch(search: string | undefined): TextSearch | null {
    const term = search?.trim();
    if (!term) return null;
    // "joao 1" não vira busca por CPF/CNPJ contendo "1".
    const docDigits = /^[\d.\-/\s]+$/.test(term) ? term.replace(/\D/g, '') : '';
    return { term,
key: searchKey(term),
docDigits };
}

const insensitive = (value: string) => ({ contains: value,
mode: 'insensitive' as const });

/** Nome (coluna *Search sem acento + coluna original). */
function nameConditions(s: TextSearch, field: string, searchField: string) {
    return [{ [searchField]: { contains: s.key } }, { [field]: insensitive(s.term) }];
}

/** E-mail com o termo digitado e, se diferente, sem acento ("joão" acha joao@…). */
function emailConditions(s: TextSearch) {
    const conds: Record<string, unknown>[] = [{ email: insensitive(s.term) }];
    if (s.key !== s.term.toLowerCase()) conds.push({ email: insensitive(s.key) });
    return conds;
}

/** CPF é gravado só com dígitos: "123.456" e "123456" acham o mesmo cadastro. */
function cpfConditions(s: TextSearch) {
    return s.docDigits ? [{ cpf: { contains: s.docDigits } }] : [];
}

/** Busca de pessoa (nome, e-mail, CPF) — usada nas pessoas e dentro do Unimed. */
function personSearchOr(s: TextSearch) {
    return [...nameConditions(s, 'name', 'nameSearch'), ...emailConditions(s), ...cpfConditions(s)];
}

export function buildUserListWhere(filters?: UserListFilters) {
    const { search, memberType, memberClassification, gender, ethnicity, educationLevel, incompleteRegistration } =
        filters ?? {};
    const s = textSearch(search);
    return {
        isDeleted: false,
        ...(s && { OR: personSearchOr(s) }),
        ...(memberType && { memberType }),
        ...(memberClassification && { memberClassification }),
        ...(gender && { gender }),
        ...(ethnicity && { ethnicity }),
        ...(educationLevel && { educationLevel }),
        ...(incompleteRegistration === true && {
            // envolto em AND p/ não sobrescrever o OR da busca (search)
            AND: [
                {
                    OR: [
                        { avatar: null },
                        { properties: { none: {} } },
                        { cpf: null },
                        { rg: null },
                        { birthDate: null },
                        { gender: null },
                    ],
                },
            ],
        }),
        ...(incompleteRegistration === false && {
            AND: [
                { avatar: { not: null } },
                { properties: { some: {} } },
                { cpf: { not: null } },
                { rg: { not: null } },
                { birthDate: { not: null } },
                { gender: { not: null } },
            ],
        }),
    };
}

export function buildCompanyListWhere(filters: CompanyListFilters) {
    const where: Record<string, unknown> = { isDeleted: false };
    if (filters.type) where.type = filters.type;
    if (filters.isPartner !== undefined) where.isPartner = filters.isPartner;
    const s = textSearch(filters.search);
    if (s) {
        const or: Record<string, unknown>[] = [
            ...nameConditions(s, 'name', 'nameSearch'),
            ...nameConditions(s, 'tradeName', 'tradeNameSearch'),
            ...emailConditions(s),
        ];
        if (s.docDigits.length >= 2) or.push({ cnpj: { contains: s.docDigits } });
        where.OR = or;
    }
    return where;
}

export function buildCourseListWhere(filters?: CourseListFilters) {
    return {
        isDeleted: false,
        ...(filters?.status && { status: filters.status }),
        ...(filters?.search && {
            name: { contains: filters.search,
mode: 'insensitive' as const },
        }),
    };
}

export function buildAdminListWhere(filters?: UserAdminListFilters) {
    const s = textSearch(filters?.search);
    return {
        isDeleted: false,
        ...(s && {
            OR: [
                { username: insensitive(s.term) },
                ...[...nameConditions(s, 'name', 'nameSearch'), ...emailConditions(s)].map(userData => ({ userData })),
            ],
        }),
        ...(filters?.rulesId && { rulesId: filters.rulesId }),
    };
}

export function buildContactMessageWhere(filters?: ContactMessageFilters) {
    return {
        isDeleted: false,
        ...(filters?.read !== undefined && { read: filters.read }),
        ...(filters?.search && {
            OR: [
                { name: { contains: filters.search,
mode: 'insensitive' as const } },
                { email: { contains: filters.search,
mode: 'insensitive' as const } },
                { subject: { contains: filters.search,
mode: 'insensitive' as const } },
            ],
        }),
    };
}

// Busca filtra pelo UserData vinculado (nome ou CPF).
export function buildUnimedListWhere(search?: string) {
    const s = textSearch(search);
    return {
        isDeleted: false,
        ...(s && { userData: { OR: [...nameConditions(s, 'name', 'nameSearch'), ...cpfConditions(s)] } }),
    };
}


function brazilDay(value: string, edge: 'start' | 'end'): Date | null {
    const iso = /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? `${value}T${edge === 'start' ? '00:00:00.000' : '23:59:59.999'}-03:00`
        : value;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
}

export function buildAuditLogWhere({ action, entity, actorId, ip, from, to, q }: AuditLogFilters) {
    const where: Record<string, unknown> = {};
    if (action === 'create') where.method = 'POST';
    else if (action === 'edit') where.method = { in: ['PATCH', 'PUT'] };
    else if (action === 'delete') where.method = 'DELETE';
    else if (action === 'export') where.method = 'EXPORT';
    else if (action === 'login') where.method = 'LOGIN';
    // Falhas: senha/usuário errado e bloqueio por excesso de tentativas.
    else if (action === 'login_failed') where.method = { in: ['LOGIN_FAILED', 'LOGIN_BLOCKED'] };
    if (entity) where.entity = entity;
    if (actorId) where.actorId = actorId;
    if (ip && ip.trim()) where.ip = ip.trim();
    // "AAAA-MM-DD" é um dia em Brasília; data inválida é ignorada.
    const start = from ? brazilDay(from, 'start') : null;
    const end = to ? brazilDay(to, 'end') : null;
    if (start || end) {
        where.createdAt = {
            ...(start ? { gte: start } : {}),
            ...(end ? { lte: end } : {}),
        };
    }
    if (q && q.trim()) {
        where.OR = [
            { targetLabel: { contains: q.trim(),
mode: 'insensitive' } },
            { path: { contains: q.trim(),
mode: 'insensitive' } },
        ];
    }
    return where;
}
