import type { PrismaClient } from '../../generated/prisma/client.js';
import type { InputJsonValue } from '../../generated/prisma/internal/prismaNamespace.js';
import type {
    AdminExportRow,
    AuditLogExportRow,
    CompanyExportRow,
    ContactMessageExportRow,
    CourseExportRow,
    ExportRepository,
    PersonExportRow,
    PropertyExportRow,
    RegistrationExportRow,
    RoomBookingExportRow,
    UnimedExportRow,
} from '../../ports/external/export-repository.js';
import {
    buildAdminListWhere,
    buildAuditLogWhere,
    buildCompanyListWhere,
    buildContactMessageWhere,
    buildCourseListWhere,
    buildUnimedListWhere,
    buildUserListWhere,
} from './list-filters.js';
import { buildRoomBookingWhere, roomBookingSelect, toRoomBookingItem } from './room-booking-adapter.js';

export function createExportAdapter(prisma: PrismaClient): ExportRepository {
    return new ExportAdapter(prisma);
}

export const AUDIT_EXPORT_LIMIT = 20_000;

// Com ids, só o que foi selecionado (ainda respeitando exclusão lógica).
const byIds = (ids: string[] | undefined) => (ids?.length ? { id: { in: ids } } : null);

const propertyInclude = {
    where: { isDeleted: false },
    include: { address: true },
    orderBy: { createdAt: 'asc' as const },
};

// A pessoa inteira, como a exportação de pessoas e os campos de pessoa do
// montador de relatórios (decisão 006) precisam. As inscrições usam o mesmo.
const personInclude = {
    properties: propertyInclude,
    companyMemberships: {
        where: { company: { isDeleted: false } },
        include: { company: { select: { name: true,
tradeName: true,
isPartner: true } } },
        orderBy: { company: { name: 'asc' as const } },
    },
    relations: {
        where: { isDeleted: false,
target: { isDeleted: false } },
        include: { target: { select: { name: true } } },
    },
    userAdmin: { select: { username: true,
isDeleted: true } },
    userInstructor: { select: { id: true } },
    unimed: { select: { plano: true,
isDeleted: true } },
    publicContact: { select: { title: true } },
    _count: { select: { courseUserRegistration: { where: { isDeleted: false } } } },
};

class ExportAdapter implements ExportRepository {
    constructor(private prisma: PrismaClient) {}

    people({ ids, take, ...filters }: Parameters<ExportRepository['people']>[0]): Promise<PersonExportRow[]> {
        return this.prisma.userData.findMany({
            where: byIds(ids) ? { ...byIds(ids),
isDeleted: false } : buildUserListWhere(filters),
            orderBy: { name: 'asc' },
            ...(take && { take }),
            include: personInclude,
        });
    }

    companies({ ids, take, ...filters }: Parameters<ExportRepository['companies']>[0]): Promise<CompanyExportRow[]> {
        return this.prisma.company.findMany({
            where: byIds(ids) ? { ...byIds(ids),
isDeleted: false } : buildCompanyListWhere(filters),
            orderBy: { name: 'asc' },
            ...(take && { take }),
            include: {
                address: true,
                members: {
                    where: { userData: { isDeleted: false } },
                    include: { userData: { select: { name: true,
cpf: true } } },
                    orderBy: { userData: { name: 'asc' } },
                },
                properties: propertyInclude,
            },
        });
    }

    properties({ ids, ownerIds, take }: Parameters<ExportRepository['properties']>[0]): Promise<PropertyExportRow[]> {
        return this.prisma.property.findMany({
            where: {
                isDeleted: false,
                ...(byIds(ids) ?? {}),
                ...(ownerIds?.length && { OR: [{ userDataId: { in: ownerIds } }, { companyId: { in: ownerIds } }] }),
                // Dono ativo (pessoa ou empresa excluída some junto).
                AND: [
                    {
                        OR: [
                            { userData: { isDeleted: false } },
                            { company: { isDeleted: false } },
                        ],
                    },
                ],
            },
            orderBy: [{ createdAt: 'asc' }],
            ...(take && { take }),
            include: {
                address: true,
                userData: { select: { name: true,
cpf: true,
primaryPropertyId: true } },
                company: { select: { name: true,
tradeName: true,
cnpj: true,
primaryPropertyId: true } },
            },
        });
    }

    admins({ ids, take, ...filters }: Parameters<ExportRepository['admins']>[0]): Promise<AdminExportRow[]> {
        return this.prisma.userAdmin.findMany({
            where: byIds(ids) ? { ...byIds(ids),
isDeleted: false } : buildAdminListWhere(filters),
            orderBy: { userData: { name: 'asc' } },
            ...(take && { take }),
            include: {
                // A pessoa inteira: os campos de pessoa do montador.
                userData: { include: personInclude },
                rules: { select: { name: true } },
            },
        });
    }

    async ruleName(id: string): Promise<string | null> {
        const rule = await this.prisma.rule.findUnique({ where: { id },
select: { name: true } });
        return rule?.name ?? null;
    }

    courses({ ids, take, order, ...filters }: Parameters<ExportRepository['courses']>[0]): Promise<CourseExportRow[]> {
        return this.prisma.course.findMany({
            where: byIds(ids) ? { ...byIds(ids),
isDeleted: false } : buildCourseListWhere(filters),
            orderBy: { startTime: order ?? 'asc' },
            ...(take && { take }),
            include: {
                room: { select: { name: true,
maxCapacity: true } },
                instructors: {
                    where: { isDeleted: false },
                    include: { instructor: { include: { userData: { select: { name: true } } } } },
                },
                courseUserRegistration: { where: { isDeleted: false },
select: { confirmed: true } },
            },
        });
    }

    registrations({ ids, courseIds, confirmed, take }: Parameters<ExportRepository['registrations']>[0]): Promise<RegistrationExportRow[]> {
        return this.prisma.courseUserRegistration.findMany({
            where: {
                isDeleted: false,
                course: { isDeleted: false },
                ...(byIds(ids) ?? {}),
                ...(courseIds?.length && { courseId: { in: courseIds } }),
                ...(confirmed === true && { confirmed: true }),
            },
            orderBy: [{ course: { startTime: 'asc' } }, { userData: { name: 'asc' } }],
            ...(take && { take }),
            include: {
                ficha: { select: { id: true } },
                course: { select: { name: true,
eventNumber: true,
startTime: true } },
                userData: { include: personInclude },
            },
        });
    }

    // Mesma ordem das inscrições (início do curso, depois o nome).
    courseNames(ids: string[]): Promise<{
 id: string;
name: string
}[]> {
        if (!ids.length) return Promise.resolve([]);
        return this.prisma.course.findMany({
            where: { id: { in: ids },
isDeleted: false },
            orderBy: [{ startTime: 'asc' }, { name: 'asc' }],
            select: { id: true,
name: true },
        });
    }

    contactMessages({ ids, take, ...filters }: Parameters<ExportRepository['contactMessages']>[0]): Promise<ContactMessageExportRow[]> {
        return this.prisma.contactMessage.findMany({
            where: byIds(ids) ? { ...byIds(ids),
isDeleted: false } : buildContactMessageWhere(filters),
            orderBy: { createdAt: 'desc' },
            ...(take && { take }),
        });
    }

    async unimed({ ids, search }: Parameters<ExportRepository['unimed']>[0]): Promise<UnimedExportRow[]> {
        const rows = await this.prisma.unimedBeneficiario.findMany({
            where: byIds(ids) ? { ...byIds(ids),
isDeleted: false } : buildUnimedListWhere(search),
            orderBy: { userData: { name: 'asc' } },
            include: {
                userData: { select: { name: true,
cpf: true,
birthDate: true,
phone: true,
email: true } },
            },
        });
        // `filter(Boolean)` nao tira o null do TIPO: sem isto o null ia parar
        // dentro do `in` da consulta seguinte.
        const titularIds = [
            ...new Set(
                rows
                    .map((r: { titularId: string | null }) => r.titularId)
                    .filter((id): id is string => !!id),
            ),
        ];
        const titulares: {
 id: string;
name: string 
}[] = titularIds.length
            ? await this.prisma.userData.findMany({ where: { id: { in: titularIds } },
select: { id: true,
name: true } })
            : [];
        const nameById = new Map(titulares.map(t => [t.id, t.name]));
        return rows.map((r: Omit<UnimedExportRow, 'titularName'> & { titularId: string | null }) => ({
            ...r,
            titularName: r.titularId ? (nameById.get(r.titularId) ?? null) : null,
        }));
    }

    async auditLogs(filters: Parameters<ExportRepository['auditLogs']>[0]): Promise<AuditLogExportRow[]> {
        type Row = Omit<AuditLogExportRow, 'actorName'> & { actorId: string | null };
        const rows: Row[] = await this.prisma.auditLog.findMany({
            where: buildAuditLogWhere(filters),
            orderBy: { createdAt: 'desc' },
            // A trilha só cresce: sai no máximo o período mais recente.
            take: AUDIT_EXPORT_LIMIT,
        });
        const actorIds = [...new Set(rows.map(r => r.actorId).filter(Boolean))] as string[];
        const admins: {
 id: string;
username: string 
}[] = actorIds.length
            ? await this.prisma.userAdmin.findMany({ where: { id: { in: actorIds } },
select: { id: true,
username: true } })
            : [];
        const nameById = new Map(admins.map(a => [a.id, a.username]));
        return rows.map(r => ({
            ...r,
            actorName: r.actorId ? (nameById.get(r.actorId) ?? '—') : 'Público',
        }));
    }

    // Mesmos filtros da listagem de reservas (com ids, só esses).
    async roomBookings(filters: Parameters<ExportRepository['roomBookings']>[0]): Promise<RoomBookingExportRow[]> {
        const rows = await this.prisma.roomBooking.findMany({
            where: buildRoomBookingWhere(filters),
            select: roomBookingSelect,
            orderBy: [{ startTime: 'asc' }, { title: 'asc' }],
        });
        return rows.map(toRoomBookingItem);
    }

    // O local do IP é preenchido depois da resposta (http/audit-hooks.ts).
    async logExport({ actorId, path, targetLabel, ip, userAgent, details }: Parameters<ExportRepository['logExport']>[0]): Promise<{ id: string }> {
        return this.prisma.auditLog.create({
            data: { actorId,
method: 'EXPORT',
path,
entity: 'Exportação',
targetLabel,
statusCode: 200,
ip,
userAgent,
...(details && { details: details as unknown as InputJsonValue }) },
            select: { id: true },
        });
    }
}
