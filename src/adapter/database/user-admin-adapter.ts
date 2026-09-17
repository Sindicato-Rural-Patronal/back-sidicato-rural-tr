import type { PrismaClient } from '@prisma/client/extension';
import { buildAdminListWhere } from './list-filters.js';
import type {
    UserAdminRepository,
    UserAdminWithDetails,
    UserAdminUpdateInput,
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
        return this.prisma.userAdmin.findFirst({ where: { username,
isDeleted: false } });
    }

    /** Inclui soft-deleted — o unique de username no banco considera os apagados. */
    findByUsernameAny(username: string): Promise<UserAdminModel | null> {
        return this.prisma.userAdmin.findFirst({ where: { username } });
    }

    findByUserDataId(userDataId: string): Promise<UserAdminModel | null> {
        return this.prisma.userAdmin.findFirst({ where: { userDataId,
isDeleted: false } });
    }

    findByUserDataIdAny(userDataId: string): Promise<UserAdminModel | null> {
        return this.prisma.userAdmin.findFirst({ where: { userDataId } });
    }

    reactivate(
        id: string,
        data: {
 username: string;
passwordHash: string;
rulesId: string 
},
    ): Promise<UserAdminModel> {
        return this.prisma.userAdmin.update({
            where: { id },
            data: { ...data,
isDeleted: false,
deletedAt: null },
        });
    }

    findById(id: string): Promise<UserAdminModel | null> {
        return this.prisma.userAdmin.findFirst({ where: { id,
isDeleted: false } });
    }

    create(data: UserAdminUncheckedCreateInput): Promise<UserAdminModel> {
        return this.prisma.userAdmin.create({ data });
    }

    findAll(filters?: UserAdminListFilters, skip?: number, take?: number): Promise<UserAdminWithDetails[]> {
        return this.prisma.userAdmin.findMany({
            where: buildAdminListWhere(filters),
            include: {
                userData: { select: { name: true,
email: true,
cpf: true,
avatar: true } },
                rules: { select: { name: true,
permissions: true } },
            },
            orderBy: { userData: { name: 'asc' } },
            skip,
            take,
        }) as Promise<UserAdminWithDetails[]>;
    }

    count(filters?: UserAdminListFilters): Promise<number> {
        return this.prisma.userAdmin.count({ where: buildAdminListWhere(filters) });
    }

    update(id: string, data: UserAdminUpdateInput): Promise<UserAdminModel | null> {
        return this.prisma.userAdmin.update({ where: { id },
data });
    }

    async delete(id: string): Promise<void> {
        await this.prisma.userAdmin.update({
            where: { id },
            data: { isDeleted: true,
deletedAt: new Date() },
        });
    }
}
