import type { PrismaClient } from '@prisma/client/extension';
import type {
    UserAdminRepository,
    UserAdminWithDetails,
    UserAdminUpdateInput,
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
        return this.prisma.userAdmin.findUnique({ where: { username } });
    }

    findByUserDataId(userDataId: string): Promise<UserAdminModel | null> {
        return this.prisma.userAdmin.findUnique({ where: { userDataId } });
    }

    findById(id: string): Promise<UserAdminModel | null> {
        return this.prisma.userAdmin.findUnique({ where: { id } });
    }

    create(data: UserAdminUncheckedCreateInput): Promise<UserAdminModel> {
        return this.prisma.userAdmin.create({ data });
    }

    findAll(skip?: number, take?: number): Promise<UserAdminWithDetails[]> {
        return this.prisma.userAdmin.findMany({
            include: {
                userData: { select: { name: true,
email: true,
cpf: true } },
                rules: { select: { name: true,
permissions: true } },
            },
            orderBy: { userData: { name: 'asc' } },
            skip,
            take,
        }) as Promise<UserAdminWithDetails[]>;
    }

    count(): Promise<number> {
        return this.prisma.userAdmin.count();
    }

    update(id: string, data: UserAdminUpdateInput): Promise<UserAdminModel | null> {
        return this.prisma.userAdmin.update({ where: { id },
data });
    }

    async delete(id: string): Promise<void> {
        await this.prisma.userAdmin.delete({ where: { id } });
    }
}
