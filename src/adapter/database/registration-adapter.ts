import { PrismaClient } from '@prisma/client/extension';
import { courseUserRegistrationModel } from '../../generated/prisma/models/courseUserRegistration.js';
import { RegistrationRepository, RegistrationWithUserData } from '../../ports/external/registration-repository.js';

const userDataSelect = {
    id: true,
    name: true,
    email: true,
    phone: true,
    cpf: true,
    cnpj: true,
    avatar: true,
} as const;

export function createRegistrationAdapter(prisma: PrismaClient): RegistrationRepository {
    return new RegistrationAdapter(prisma);
}

class RegistrationAdapter implements RegistrationRepository {
    constructor(private prisma: PrismaClient) {}

    create(courseId: string, userDataId: string): Promise<courseUserRegistrationModel> {
        return this.prisma.courseUserRegistration.create({
            data: { courseId, userDataId },
        });
    }

    findById(id: string): Promise<RegistrationWithUserData | null> {
        return this.prisma.courseUserRegistration.findUnique({
            where: { id },
            include: { userData: { select: userDataSelect } },
        });
    }

    findByCourseId(courseId: string): Promise<RegistrationWithUserData[]> {
        return this.prisma.courseUserRegistration.findMany({
            where: { courseId },
            include: { userData: { select: userDataSelect } },
            orderBy: { createdAt: 'desc' },
        });
    }

    findByUserDataAndCourse(userDataId: string, courseId: string): Promise<courseUserRegistrationModel | null> {
        return this.prisma.courseUserRegistration.findFirst({
            where: { userDataId, courseId },
        });
    }

    async delete(id: string): Promise<boolean> {
        try {
            await this.prisma.courseUserRegistration.delete({ where: { id } });
            return true;
        } catch {
            return false;
        }
    }
}
