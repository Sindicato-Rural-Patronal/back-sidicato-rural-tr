import type { PrismaClient } from '@prisma/client/extension';
import type { courseUserRegistrationModel } from '../../generated/prisma/models/courseUserRegistration.js';
import type {
    RegistrationRepository,
    RegistrationWithUserData,
} from '../../ports/external/registration-repository.js';

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
            data: { courseId,
userDataId },
        });
    }

    findById(id: string): Promise<RegistrationWithUserData | null> {
        return this.prisma.courseUserRegistration.findFirst({
            where: { id, isDeleted: false },
            include: { userData: { select: userDataSelect } },
        });
    }

    findByCourseId(courseId: string, skip?: number, take?: number): Promise<RegistrationWithUserData[]> {
        return this.prisma.courseUserRegistration.findMany({
            where: { courseId, isDeleted: false },
            include: { userData: { select: userDataSelect } },
            orderBy: { createdAt: 'desc' },
            skip,
            take,
        });
    }

    countByCourseId(courseId: string): Promise<number> {
        return this.prisma.courseUserRegistration.count({ where: { courseId, isDeleted: false } });
    }

    findByUserDataAndCourse(
        userDataId: string,
        courseId: string,
    ): Promise<courseUserRegistrationModel | null> {
        return this.prisma.courseUserRegistration.findFirst({
            where: { userDataId, courseId, isDeleted: false },
        });
    }

    count(): Promise<number> {
        return this.prisma.courseUserRegistration.count({ where: { isDeleted: false } });
    }

    async delete(id: string): Promise<boolean> {
        try {
            await this.prisma.courseUserRegistration.update({
                where: { id },
                data: { isDeleted: true, deletedAt: new Date() },
            });
            return true;
        } catch {
            return false;
        }
    }
}
