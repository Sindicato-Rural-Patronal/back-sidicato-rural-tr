import type { PrismaClient } from '@prisma/client/extension';
import type { UserDataUncheckedCreateInput, UserDataModel } from '../../generated/prisma/models';
import type {
    UserDataRepository,
    UserDataUpdateInput,
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
    findByEmailOurPhone(email: string, phone: string): Promise<UserDataModel | null> {
        return this.prisma.userData.findFirst({
            where: {
                OR: [{ email }, { phone }],
            },
        });
    }
    findById(id: string): Promise<UserDataModel | null> {
        return this.prisma.userData.findUnique({ where: { id } });
    }

    findAll(skip?: number, take?: number): Promise<UserDataModel[]> {
        return this.prisma.userData.findMany({ orderBy: { name: 'asc' },
skip,
take });
    }

    count(): Promise<number> {
        return this.prisma.userData.count();
    }

    findByEmailOrCpf(email: string, cpf: string): Promise<UserDataModel | null> {
        return this.prisma.userData.findFirst({
            where: {
                OR: [{ email }, { cpf }],
            },
        });
    }

    update(id: string, data: UserDataUpdateInput): Promise<UserDataModel | null> {
        return this.prisma.userData.update({ where: { id },
data });
    }

    async delete(id: string): Promise<void> {
        await this.prisma.userData.delete({ where: { id } });
    }
}
