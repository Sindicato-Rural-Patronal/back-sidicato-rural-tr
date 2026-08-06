import type { PrismaClient } from '@prisma/client/extension';
import type { courseUserRegistrationModel } from '../../generated/prisma/models/courseUserRegistration.js';
import type {
    RegistrationRepository,
    RegistrationWithUserData,
    RegistrationFichaFile,
} from '../../ports/external/registration-repository.js';

const userDataSelect = {
    id: true,
    name: true,
    email: true,
    phone: true,
    cpf: true,
    cnpj: true,
    avatar: true,
    birthDate: true,
    isPartner: true,
    boardMember: true,
    boardPosition: true,
    userAdmin: { select: { publicTitle: true,
isPublic: true } },
} as const;

// Só metadados da ficha — nunca os bytes (`data`) na listagem.
const fichaMetaSelect = { select: { id: true,
filename: true,
createdAt: true } } as const;

const registrationInclude = { userData: { select: userDataSelect },
ficha: fichaMetaSelect } as const;

export function createRegistrationAdapter(prisma: PrismaClient): RegistrationRepository {
    return new RegistrationAdapter(prisma);
}

class RegistrationAdapter implements RegistrationRepository {
    constructor(private prisma: PrismaClient) {}

    create(courseId: string, userDataId: string): Promise<courseUserRegistrationModel> {
        return this.prisma.courseUserRegistration.create({
            data: { courseId,
userDataId },
        });
    }

    findById(id: string): Promise<RegistrationWithUserData | null> {
        return this.prisma.courseUserRegistration.findFirst({
            where: { id,
isDeleted: false },
            include: registrationInclude,
        });
    }

    findByCourseId(courseId: string, skip?: number, take?: number): Promise<RegistrationWithUserData[]> {
        return this.prisma.courseUserRegistration.findMany({
            where: { courseId,
isDeleted: false },
            include: registrationInclude,
            orderBy: { createdAt: 'desc' },
            skip,
            take,
        });
    }

    countByCourseId(courseId: string): Promise<number> {
        return this.prisma.courseUserRegistration.count({ where: { courseId,
isDeleted: false } });
    }

    findByUserDataAndCourse(
        userDataId: string,
        courseId: string,
    ): Promise<courseUserRegistrationModel | null> {
        return this.prisma.courseUserRegistration.findFirst({
            where: { userDataId,
courseId,
isDeleted: false },
        });
    }

    count(filter?: { since?: Date }): Promise<number> {
        return this.prisma.courseUserRegistration.count({
            where: {
                isDeleted: false,
                ...(filter?.since && { createdAt: { gte: filter.since } }),
            },
        });
    }

    setConfirmed(id: string, confirmed: boolean): Promise<courseUserRegistrationModel | null> {
        return this.prisma.courseUserRegistration.update({ where: { id },
data: { confirmed } });
    }

    countUnconfirmed(courseId: string): Promise<number> {
        return this.prisma.courseUserRegistration.count({
            where: { courseId,
isDeleted: false,
confirmed: false },
        });
    }

    async delete(id: string): Promise<boolean> {
        try {
            await this.prisma.courseUserRegistration.update({
                where: { id },
                data: { isDeleted: true,
deletedAt: new Date() },
            });
            return true;
        } catch {
            return false;
        }
    }

    async setFicha(
        registrationId: string,
        data: Buffer,
        filename: string,
        mimeType: string,
    ): Promise<void> {
        await this.prisma.registrationFicha.upsert({
            where: { registrationId },
            create: { registrationId,
data,
filename,
mimeType },
            update: { data,
filename,
mimeType },
        });
    }

    async getFicha(registrationId: string): Promise<RegistrationFichaFile | null> {
        const row = await this.prisma.registrationFicha.findUnique({ where: { registrationId } });
        if (!row) return null;
        return { data: Buffer.from(row.data),
filename: row.filename,
mimeType: row.mimeType };
    }

    async deleteFicha(registrationId: string): Promise<boolean> {
        try {
            await this.prisma.registrationFicha.delete({ where: { registrationId } });
            return true;
        } catch {
            return false;
        }
    }
}
