import type { PrismaClient } from '@prisma/client/extension';
import type {
    UserAdminRepository,
    UserAdminWithDetails,
    UserAdminUpdateInput,
    PublicContactItem,
    UserAdminListFilters,
} from '../../ports/external/user-admin-repository.js';
import type {
    UserAdminModel,
    UserAdminUncheckedCreateInput,
} from '../../generated/prisma/models/UserAdmin.js';

export function createUserAdminAdapter(prisma: PrismaClient): UserAdminRepository {
    return new UserAdminAdapter(prisma);
}

export class UserAdminAdapter implements UserAdminRepository {
    constructor(private prisma: PrismaClient) {}

    findByUsername(username: string): Promise<UserAdminModel | null> {
        return this.prisma.userAdmin.findFirst({ where: { username, isDeleted: false } });
    }

    findByUserDataId(userDataId: string): Promise<UserAdminModel | null> {
        return this.prisma.userAdmin.findFirst({ where: { userDataId, isDeleted: false } });
    }

    findById(id: string): Promise<UserAdminModel | null> {
        return this.prisma.userAdmin.findFirst({ where: { id, isDeleted: false } });
    }

    create(data: UserAdminUncheckedCreateInput): Promise<UserAdminModel> {
        return this.prisma.userAdmin.create({ data });
    }

    findAll(filters?: UserAdminListFilters, skip?: number, take?: number): Promise<UserAdminWithDetails[]> {
        return this.prisma.userAdmin.findMany({
            where: {
                isDeleted: false,
                ...(filters?.search && {
                    OR: [
                        { username: { contains: filters.search, mode: 'insensitive' as const } },
                        { userData: { name: { contains: filters.search, mode: 'insensitive' as const } } },
                        { userData: { email: { contains: filters.search, mode: 'insensitive' as const } } },
                    ],
                }),
                ...(filters?.rulesId && { rulesId: filters.rulesId }),
                ...(filters?.isPublic !== undefined && { isPublic: filters.isPublic }),
            },
            include: {
                userData: { select: { name: true, email: true, cpf: true } },
                rules: { select: { name: true, permissions: true } },
            },
            orderBy: { userData: { name: 'asc' } },
            skip,
            take,
        }) as Promise<UserAdminWithDetails[]>;
    }

    count(filters?: UserAdminListFilters): Promise<number> {
        return this.prisma.userAdmin.count({
            where: {
                isDeleted: false,
                ...(filters?.search && {
                    OR: [
                        { username: { contains: filters.search, mode: 'insensitive' as const } },
                        { userData: { name: { contains: filters.search, mode: 'insensitive' as const } } },
                        { userData: { email: { contains: filters.search, mode: 'insensitive' as const } } },
                    ],
                }),
                ...(filters?.rulesId && { rulesId: filters.rulesId }),
                ...(filters?.isPublic !== undefined && { isPublic: filters.isPublic }),
            },
        });
    }

    update(id: string, data: UserAdminUpdateInput): Promise<UserAdminModel | null> {
        return this.prisma.userAdmin.update({ where: { id },
data });
    }

    async delete(id: string): Promise<void> {
        await this.prisma.userAdmin.update({
            where: { id },
            data: { isDeleted: true, deletedAt: new Date() },
        });
    }

    findAllPublic(): Promise<PublicContactItem[]> {
        return this.prisma.userAdmin.findMany({
            where: { isDeleted: false, isPublic: true },
            select: {
                publicTitle: true,
                userData: { select: { name: true, email: true, phone: true } },
            },
            orderBy: { userData: { name: 'asc' } },
        }) as Promise<PublicContactItem[]>;
    }
}
