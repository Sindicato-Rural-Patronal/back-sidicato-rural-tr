import type { PrismaClient } from '@prisma/client/extension';
import type {
    CompanyRepository,
    CompanyListFilters,
    CompanyListItem,
    CompanyModel,
    CompanyDetail,
    CompanyInput,
    CompanyUpdateInput,
    CompanyMemberModel,
    PartnerItem,
} from '../../ports/external/company-repository.js';

export function createCompanyAdapter(prisma: PrismaClient): CompanyRepository {
    return new CompanyAdapter(prisma);
}

const personSelect = { id: true,
name: true,
cpf: true,
phone: true,
email: true } as const;

class CompanyAdapter implements CompanyRepository {
    constructor(private prisma: PrismaClient) {}

    private buildWhere(filters: CompanyListFilters) {
        const where: Record<string, unknown> = { isDeleted: false };
        if (filters.type) where.type = filters.type;
        if (filters.isPartner !== undefined) where.isPartner = filters.isPartner;
        const q = filters.search?.trim();
        if (q) {
            const digits = q.replace(/\D/g, '');
            const or: Record<string, unknown>[] = [
                { name: { contains: q,
mode: 'insensitive' } },
                { email: { contains: q,
mode: 'insensitive' } },
            ];
            if (digits.length >= 2) or.push({ cnpj: { contains: digits } });
            where.OR = or;
        }
        return where;
    }

    async findAll(filters: CompanyListFilters, skip: number, take: number): Promise<CompanyListItem[]> {
        const rows = await this.prisma.company.findMany({
            where: this.buildWhere(filters),
            orderBy: { name: 'asc' },
            skip,
            take,
            include: { _count: { select: { members: { where: { userData: { isDeleted: false } } } } } },
        });
        return rows.map(({ _count, ...c }: { _count: { members: number } } & CompanyModel) => ({
            ...c,
            membersCount: _count.members,
        }));
    }

    count(filters: CompanyListFilters): Promise<number> {
        return this.prisma.company.count({ where: this.buildWhere(filters) });
    }

    findById(id: string): Promise<CompanyModel | null> {
        return this.prisma.company.findFirst({ where: { id,
isDeleted: false } });
    }

    findDetail(id: string): Promise<CompanyDetail | null> {
        return this.prisma.company.findFirst({
            where: { id,
isDeleted: false },
            include: {
                members: {
                    where: { userData: { isDeleted: false } },
                    include: { userData: { select: personSelect } },
                    orderBy: { userData: { name: 'asc' } },
                },
                properties: {
                    where: { isDeleted: false },
                    include: { address: true },
                    orderBy: { createdAt: 'asc' },
                },
            },
        }) as Promise<CompanyDetail | null>;
    }

    findByCnpj(cnpjDigits: string): Promise<CompanyModel | null> {
        return this.prisma.company.findFirst({ where: { cnpj: cnpjDigits,
isDeleted: false } });
    }

    create(data: CompanyInput & { createdBy?: string | null }): Promise<CompanyModel> {
        return this.prisma.company.create({ data });
    }

    update(id: string, data: CompanyUpdateInput): Promise<CompanyModel> {
        return this.prisma.company.update({ where: { id },
data });
    }

    async softDelete(id: string): Promise<void> {
        await this.prisma.company.update({ where: { id },
data: { isDeleted: true,
deletedAt: new Date() } });
    }

    findMember(memberId: string): Promise<CompanyMemberModel | null> {
        return this.prisma.companyMember.findUnique({ where: { id: memberId } });
    }

    findMemberByPerson(companyId: string, userDataId: string): Promise<CompanyMemberModel | null> {
        return this.prisma.companyMember.findUnique({ where: { companyId_userDataId: { companyId,
userDataId } } });
    }

    addMember(data: {
 companyId: string;
userDataId: string;
title: string 
}): Promise<CompanyMemberModel> {
        return this.prisma.companyMember.create({ data });
    }

    updateMemberTitle(memberId: string, title: string): Promise<CompanyMemberModel> {
        return this.prisma.companyMember.update({ where: { id: memberId },
data: { title } });
    }

    async removeMember(memberId: string): Promise<void> {
        await this.prisma.companyMember.delete({ where: { id: memberId } });
    }

    async listTitles(): Promise<string[]> {
        const rows = await this.prisma.companyMember.findMany({
            distinct: ['title'],
            select: { title: true },
            orderBy: { title: 'asc' },
            take: 200,
        });
        return rows.map((r: { title: string }) => r.title);
    }

    async findPartners(): Promise<PartnerItem[]> {
        const rows = await this.prisma.company.findMany({
            where: { isDeleted: false,
isPartner: true },
            select: { id: true,
name: true,
partnerLogo: true,
partnerUrl: true,
cnpj: true },
            orderBy: [{ partnerOrder: { sort: 'asc',
nulls: 'last' } }, { name: 'asc' }],
        });
        return rows.map((r: {
 id: string;
name: string;
partnerLogo: string | null;
partnerUrl: string | null;
cnpj: string | null 
}) => ({
            id: r.id,
            name: r.name,
            avatarUrl: null,
            partnerLogoUrl: r.partnerLogo,
            partnerUrl: r.partnerUrl,
            cnpj: r.cnpj,
        }));
    }

    async reorderPartners(companyIds: string[]): Promise<void> {
        await this.prisma.$transaction(
            companyIds.map((id, index) =>
                this.prisma.company.update({ where: { id },
data: { partnerOrder: index } }),
            ),
        );
    }
}
