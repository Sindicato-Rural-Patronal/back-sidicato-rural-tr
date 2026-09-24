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
    /** Dígitos do termo quando ele parece documento ou telefone (só números e pontuação); senão ''. */
    docDigits: string;
};

/** Termo aparado + chave sem acento + dígitos de documento; null se a busca está vazia. */
function textSearch(search: string | undefined): TextSearch | null {
    const term = search?.trim();
    if (!term) return null;
    // "joao 1" não vira busca por CPF/CNPJ/telefone contendo "1".
    // Parênteses e "+" entram por causa do telefone: "(44) 99999-0001".
    const docDigits = /^[\d.\-/\s()+]+$/.test(term) ? term.replace(/\D/g, '') : '';
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

/**
 * Telefone: cadastros antigos gravaram com máscara e os novos só com dígitos.
 * Sem função no `contains` do Prisma, procura pelos dois — os dígitos ("44999")
 * e o termo como foi digitado ("(44) 99999"). Só quando a busca parece um
 * telefone (números e pontuação) e tem ao menos 3 dígitos, senão "1" casaria
 * com quase todo mundo.
 */
function phoneConditions(s: TextSearch) {
    if (s.docDigits.length < 3) return [];
    const values = s.term === s.docDigits ? [s.docDigits] : [s.docDigits, s.term];
    return values.flatMap(value => [
        { phone: { contains: value } },
        { phone2: { contains: value } },
        { phone3: { contains: value } },
    ]);
}

/** Busca de pessoa (nome, e-mail, CPF, telefones) — pessoas e Unimed. */
function personSearchOr(s: TextSearch) {
    return [
        ...nameConditions(s, 'name', 'nameSearch'),
        ...emailConditions(s),
        ...cpfConditions(s),
        ...phoneConditions(s),
    ];
}

/** Hoje as 00:00, para comparar validade so pela data (vale o dia inteiro). */
function hojeSemHora(): Date {
    const agora = new Date();
    return new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
}

export function buildUserListWhere(filters?: UserListFilters) {
    const {
        search, memberType, memberClassification, gender, ethnicity, educationLevel,
        incompleteRegistration, activeMember,
    } = filters ?? {};
    const s = textSearch(search);
    return {
        isDeleted: false,
        ...(s && { OR: personSearchOr(s) }),
        ...(memberType && { memberType }),
        ...(memberClassification && { memberClassification }),
        ...(gender && { gender }),
        ...(ethnicity && { ethnicity }),
        ...(educationLevel && { educationLevel }),
        // Associado em dia. Vai em AND porque tem OR proprio (validade em
        // branco tambem conta) e nao pode atropelar o OR da busca.
        ...(activeMember === true && {
            memberStatus: 'ACTIVE' as const,
            AND: [
                { OR: [{ membershipValidUntil: null }, { membershipValidUntil: { gte: hojeSemHora() } }] },
            ],
        }),
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
            ...phoneConditions(s),
        ];
        if (s.docDigits.length >= 2) or.push({ cnpj: { contains: s.docDigits } });
        where.OR = or;
    }
    return where;
}

/**
 * Separa o ano do resto da busca de cursos. Um pedaco solto de 4 digitos entre
 * 1990 e 2100 vale como ano: digitar "2023" lista o ano todo e "2023 horta"
 * estreita dentro dele. E o jeito de achar curso antigo sem precisar de filtro
 * proprio na tela.
 */
export function splitCourseSearch(search?: string): { year?: number; text?: string } {
    const termos = (search ?? '').trim().split(/\s+/).filter(Boolean);
    if (termos.length === 0) return {};

    let year: number | undefined;
    const resto: string[] = [];
    for (const termo of termos) {
        const n = Number(termo);
        if (year === undefined && /^\d{4}$/.test(termo) && n >= 1990 && n <= 2100) year = n;
        else resto.push(termo);
    }
    const text = resto.join(' ');
    return { year,
text: text || undefined };
}

export function buildCourseListWhere(filters?: CourseListFilters) {
    const { year, text } = splitCourseSearch(filters?.search);
    return {
        isDeleted: false,
        ...(filters?.status && { status: filters.status }),
        // O curso guarda horario de parede, entao o ano vai em UTC igual ao resto.
        ...(year !== undefined && {
            startTime: { gte: new Date(Date.UTC(year, 0, 1)),
lt: new Date(Date.UTC(year + 1, 0, 1)) },
        }),
        // O numero do evento ja era prometido na tela de busca e nunca procurado.
        ...(text && {
            OR: [
                { name: { contains: text,
mode: 'insensitive' as const } },
                { eventNumber: { contains: text,
mode: 'insensitive' as const } },
            ],
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

// Busca filtra pelo UserData vinculado (nome, CPF ou telefone).
// `userDataId` traz os cadastros ligados à pessoa: o dela e aqueles em que ela é
// o titular da família (usado na aba Unimed da ficha da pessoa).
export function buildUnimedListWhere(search?: string, userDataId?: string) {
    const s = textSearch(search);
    return {
        isDeleted: false,
        ...(s && {
            userData: {
                OR: [...nameConditions(s, 'name', 'nameSearch'), ...cpfConditions(s), ...phoneConditions(s)],
            },
        }),
        ...(userDataId && { OR: [{ userDataId },
{ titularId: userDataId }] }),
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
