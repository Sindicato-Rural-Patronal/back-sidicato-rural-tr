import type { PrismaClient } from '@prisma/client/extension';
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

export function createExportAdapter(prisma: PrismaClient): ExportRepository {
    return new ExportAdapter(prisma);
}

// Com ids, só o que foi selecionado (ainda respeitando exclusão lógica).
const byIds = (ids: string[] | undefined) => (ids?.length ? { id: { in: ids } } : null);

const propertyInclude = {
    where: { isDeleted: false },
    include: { address: true },
    orderBy: { createdAt: 'asc' as const },
};

class ExportAdapter implements ExportRepository {
    constructor(private prisma: PrismaClient) {}

    people({ ids, ...filters }: Parameters<ExportRepository['people']>[0]): Promise<PersonExportRow[]> {
        return this.prisma.userData.findMany({
            where: byIds(ids) ? { ...byIds(ids),
isDeleted: false } : buildUserListWhere(filters),
            orderBy: { name: 'asc' },
            include: {
                properties: propertyInclude,
                companyMemberships: {
                    where: { company: { isDeleted: false } },
                    include: { company: { select: { name: true,
tradeName: true } } },
                    orderBy: { company: { name: 'asc' } },
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
            },
        });
    }

    companies({ ids, ...filters }: Parameters<ExportRepository['companies']>[0]): Promise<CompanyExportRow[]> {
        return this.prisma.company.findMany({
            where: byIds(ids) ? { ...byIds(ids),
isDeleted: false } : buildCompanyListWhere(filters),
            orderBy: { name: 'asc' },
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

    properties({ ids, ownerIds }: Parameters<ExportRepository['properties']>[0]): Promise<PropertyExportRow[]> {
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

    admins({ ids, ...filters }: Parameters<ExportRepository['admins']>[0]): Promise<AdminExportRow[]> {
        return this.prisma.userAdmin.findMany({
            where: byIds(ids) ? { ...byIds(ids),
isDeleted: false } : buildAdminListWhere(filters),
            orderBy: { userData: { name: 'asc' } },
            include: {
                userData: { select: { name: true,
email: true,
cpf: true,
phone: true } },
                rules: { select: { name: true } },
            },
        });
    }

    courses({ ids, ...filters }: Parameters<ExportRepository['courses']>[0]): Promise<CourseExportRow[]> {
        return this.prisma.course.findMany({
            where: byIds(ids) ? { ...byIds(ids),
isDeleted: false } : buildCourseListWhere(filters),
            orderBy: { startTime: 'asc' },
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

    registrations({ ids, courseIds }: Parameters<ExportRepository['registrations']>[0]): Promise<RegistrationExportRow[]> {
        return this.prisma.courseUserRegistration.findMany({
            where: {
                isDeleted: false,
                course: { isDeleted: false },
                ...(byIds(ids) ?? {}),
                ...(courseIds?.length && { courseId: { in: courseIds } }),
            },
            orderBy: [{ course: { startTime: 'asc' } }, { userData: { name: 'asc' } }],
            include: {
                ficha: { select: { id: true } },
                course: { select: { name: true,
eventNumber: true,
startTime: true } },
                userData: {
                    select: {
                        name: true,
                        cpf: true,
                        email: true,
                        phone: true,
                        birthDate: true,
                        memberStatus: true,
                        membershipValidUntil: true,
                        boardPosition: true,
                        companyMemberships: {
                            where: { company: { isPartner: true,
isDeleted: false } },
                            select: { company: { select: { name: true,
tradeName: true } } },
                        },
                    },
                },
            },
        });
    }

    contactMessages({ ids, ...filters }: Parameters<ExportRepository['contactMessages']>[0]): Promise<ContactMessageExportRow[]> {
        return this.prisma.contactMessage.findMany({
            where: byIds(ids) ? { ...byIds(ids),
isDeleted: false } : buildContactMessageWhere(filters),
            orderBy: { createdAt: 'desc' },
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
        const titularIds = [...new Set(rows.map((r: { titularId: string | null }) => r.titularId).filter(Boolean))];
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

    async logExport({ actorId, path, targetLabel }: Parameters<ExportRepository['logExport']>[0]): Promise<void> {
        await this.prisma.auditLog.create({
            data: { actorId,
method: 'EXPORT',
path,
entity: 'Exportação',
targetLabel,
statusCode: 200 },
        });
    }
}
