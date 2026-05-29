import { PrismaClient } from "@prisma/client/extension";
import { UserDataUncheckedCreateInput, UserDataModel } from "../../generated/prisma/models";
import { UserDataRepository } from "../../ports/external/user-data-repository";

export function createUserDataAdapter(prisma: PrismaClient): UserDataRepository {
    return new UserDataAdapter(prisma);
}
export class UserDataAdapter implements UserDataRepository {
    constructor(private prisma: PrismaClient) {}
    create(data: UserDataUncheckedCreateInput): Promise<UserDataModel | null> {
        return this.prisma.userData.create({   
            data
        }); 
    }
    findByEmailOurPhone(email: string, phone: string): Promise<UserDataModel | null> {
        return this.prisma.userData.findFirst({
            where: {
                OR: [
                    { email },
                    { phone }
                ]
            }
        });
    }
    findById(id: string): Promise<UserDataModel | null> {
        return this.prisma.userData.findUnique({ where: { id } });
    }

    findAll(): Promise<UserDataModel[]> {
        return this.prisma.userData.findMany({ orderBy: { name: 'asc' } });
    }

    findByEmailOrCpf(email: string, cpf: string): Promise<UserDataModel | null> {
        return this.prisma.userData.findFirst({
            where: {
                OR: [{ email }, { cpf }],
            },
        });
    }
}   
