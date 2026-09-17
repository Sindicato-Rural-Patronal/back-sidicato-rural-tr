import type { UserListFilters } from '../../ports/external/user-data-repository.js';
import type { CompanyListFilters } from '../../ports/external/company-repository.js';
import type { CourseListFilters } from '../../ports/external/course-repository.js';
import type { UserAdminListFilters } from '../../ports/external/user-admin-repository.js';
import type { ContactMessageFilters } from '../../ports/external/contact-message-repository.js';
import type { AuditLogFilters } from '../../ports/external/export-repository.js';

// Filtros das listagens do painel. Ficam aqui para a exportação usar exatamente
// os mesmos filtros da tela (o que se vê na lista é o que sai na planilha).

export function buildUserListWhere(filters?: UserListFilters) {
    const { search, memberType, memberClassification, gender, ethnicity, educationLevel, incompleteRegistration } =
        filters ?? {};
    return {
        isDeleted: false,
        ...(search && {
            OR: [
                { name: { contains: search,
mode: 'insensitive' as const } },
                { email: { contains: search,
mode: 'insensitive' as const } },
                { cpf: { contains: search } },
            ],
        }),
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
    const q = filters.search?.trim();
    if (q) {
        const digits = q.replace(/\D/g, '');
        const or: Record<string, unknown>[] = [
            { name: { contains: q,
mode: 'insensitive' } },
            { tradeName: { contains: q,
mode: 'insensitive' } },
            { email: { contains: q,
mode: 'insensitive' } },
        ];
        if (digits.length >= 2) or.push({ cnpj: { contains: digits } });
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
    return {
        isDeleted: false,
        ...(filters?.search && {
            OR: [
                { username: { contains: filters.search,
mode: 'insensitive' as const } },
                { userData: { name: { contains: filters.search,
mode: 'insensitive' as const } } },
                { userData: { email: { contains: filters.search,
mode: 'insensitive' as const } } },
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
    return {
        isDeleted: false,
        ...(search
            ? {
                  userData: {
                      OR: [
                          { name: { contains: search,
mode: 'insensitive' as const } },
                          { cpf: { contains: search } },
                      ],
                  },
              }
            : {}),
    };
}


function brazilDay(value: string, edge: 'start' | 'end'): Date | null {
    const iso = /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? `${value}T${edge === 'start' ? '00:00:00.000' : '23:59:59.999'}-03:00`
        : value;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
}

export function buildAuditLogWhere({ action, entity, actorId, from, to, q }: AuditLogFilters) {
    const where: Record<string, unknown> = {};
    if (action === 'create') where.method = 'POST';
    else if (action === 'edit') where.method = { in: ['PATCH', 'PUT'] };
    else if (action === 'delete') where.method = 'DELETE';
    else if (action === 'export') where.method = 'EXPORT';
    if (entity) where.entity = entity;
    if (actorId) where.actorId = actorId;
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
