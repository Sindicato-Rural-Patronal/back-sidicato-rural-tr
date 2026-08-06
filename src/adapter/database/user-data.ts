import type { PrismaClient } from '@prisma/client/extension';
import type { UserDataUncheckedCreateInput, UserDataModel } from '../../generated/prisma/models';
import type {
    UserDataRepository,
    UserDataUpdateInput,
    UserDataWithRelations,
    PartnerItem,
    UserListFilters,
} from '../../ports/external/user-data-repository.js';

export function createUserDataAdapter(prisma: PrismaClient): UserDataRepository {
    return new UserDataAdapter(prisma);
}
export class UserDataAdapter implements UserDataRepository {
    constructor(private prisma: PrismaClient) {}
    create(data: UserDataUncheckedCreateInput): Promise<UserDataModel | null> {
        return this.prisma.userData.create({
            data,
        });
    }
    findById(id: string): Promise<UserDataModel | null> {
        return this.prisma.userData.findFirst({ where: { id,
isDeleted: false } });
    }

    findByIdWithRelations(id: string): Promise<UserDataWithRelations | null> {
        return this.prisma.userData.findFirst({
            where: { id,
isDeleted: false },
            include: {
                relations: {
                    where: { isDeleted: false,
target: { isDeleted: false } },
                    include: {
                        target: {
                            select: { id: true,
name: true,
cpf: true },
                        },
                    },
                },
                properties: {
                    where: { isDeleted: false },
                    include: {
                        address: true,
                    },
                },
                userInstructor: true,
            },
        }) as Promise<UserDataWithRelations | null>;
    }

    findAll(filters?: UserListFilters, skip?: number, take?: number): Promise<UserDataModel[]> {
        return this.prisma.userData.findMany({
            where: this.buildWhere(filters),
            orderBy: { name: 'asc' },
            skip,
            take,
        });
    }

    count(filters?: UserListFilters): Promise<number> {
        return this.prisma.userData.count({ where: this.buildWhere(filters) });
    }

    private buildWhere(filters?: UserListFilters) {
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

    // Compara por CPF ignorando formatação: os CPFs foram gravados em formatos
    // inconsistentes (com pontos, traços, só dígitos), então normalizamos os
    // dois lados removendo tudo que não é dígito.
    async findByCpf(cpf: string): Promise<UserDataModel | null> {
        const digits = cpf.replace(/\D/g, '');
        if (!digits) return null;
        const rows = await this.prisma.$queryRaw<UserDataModel[]>`
            SELECT * FROM "UserData"
            WHERE "isDeleted" = false
              AND regexp_replace(COALESCE("cpf", ''), '[^0-9]', '', 'g') = ${digits}
            LIMIT 1`;
        return rows[0] ?? null;
    }

    findByRg(rg: string): Promise<UserDataModel | null> {
        return this.prisma.userData.findFirst({ where: { isDeleted: false,
rg } });
    }

    async findByEmailOrCpf(email: string, cpf: string): Promise<UserDataModel | null> {
        const digits = cpf.replace(/\D/g, '');
        // digits vazio não deve casar com CPFs nulos ('' = ''), por isso o guard.
        const rows = await this.prisma.$queryRaw<UserDataModel[]>`
            SELECT * FROM "UserData"
            WHERE "isDeleted" = false
              AND ("email" = ${email}
                   OR (${digits} <> ''
                       AND regexp_replace(COALESCE("cpf", ''), '[^0-9]', '', 'g') = ${digits}))
            LIMIT 1`;
        return rows[0] ?? null;
    }

    update(id: string, data: UserDataUpdateInput): Promise<UserDataModel | null> {
        return this.prisma.userData.update({ where: { id },
data });
    }

    async delete(id: string): Promise<void> {
        await this.prisma.userData.update({
            where: { id },
            data: { isDeleted: true,
deletedAt: new Date() },
        });
    }

    async findAllPartners(): Promise<PartnerItem[]> {
        const rows = await this.prisma.userData.findMany({
            where: { isDeleted: false,
isPartner: true },
            select: { id: true,
name: true,
avatar: true,
partnerLogo: true,
partnerUrl: true,
cnpj: true },
            orderBy: [{ partnerOrder: { sort: 'asc',
nulls: 'last' } }, { name: 'asc' }],
        });
        return rows.map((r: typeof rows[0]) => ({ id: r.id,
name: r.name,
avatarUrl: r.avatar,
partnerLogoUrl: r.partnerLogo,
partnerUrl: r.partnerUrl,
cnpj: r.cnpj }));
    }

    async reorderPartners(ids: string[]): Promise<void> {
        await this.prisma.$transaction(
            ids.map((id, index) =>
                this.prisma.userData.update({ where: { id },
data: { partnerOrder: index } }),
            ),
        );
    }
}
