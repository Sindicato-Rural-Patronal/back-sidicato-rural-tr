import type { PrismaClient } from '../../generated/prisma/client.js';
import { semRegistro } from './prisma-errors.js';
import type { UserInstructorModel, CourseInstructorModel } from '../../generated/prisma/models.js';
import type {
    InstructorRepository,
    InstructorUpdateData,
    UserInstructorWithUser,
} from '../../ports/external/instructor-repository.js';

export function createInstructorAdapter(prisma: PrismaClient): InstructorRepository {
    return new InstructorAdapter(prisma);
}

export class InstructorAdapter implements InstructorRepository {
    constructor(private prisma: PrismaClient) {}

    promote(
        userDataId: string,
        bio?: string,
        linkedin?: string,
        instagram?: string,
        facebook?: string,
    ): Promise<UserInstructorModel> {
        // Quem ja foi instrutor tem a linha guardada (o unique de userDataId
        // conta tambem as excluidas): promover de novo revive a mesma linha,
        // com os dados novos, em vez de estourar o unique.
        const data = { userDataId,
bio,
linkedin,
instagram,
facebook };
        return this.prisma.userInstructor.upsert({
            where: { userDataId },
            create: data,
            update: { ...data,
isDeleted: false,
deletedAt: null },
        });
    }

    update(userDataId: string, data: InstructorUpdateData): Promise<UserInstructorModel | null> {
        return this.prisma.userInstructor.update({ where: { userDataId },
data });
    }

    // Soft-delete, nao DELETE. A escala em curso (CourseInstructor.instructorId)
    // e uma FK obrigatoria sem cascade: apagar a linha de quem ja deu qualquer
    // curso violava a chave estrangeira. O erro caia num catch mudo e o usecase
    // nem olhava o retorno, entao "remover instrutor" respondia 200 e nao
    // removia nada. Marcando, o historico dos cursos antigos fica inteiro.
    async demote(userDataId: string): Promise<boolean> {
        const { count } = await this.prisma.userInstructor.updateMany({
            where: { userDataId,
isDeleted: false },
            data: { isDeleted: true,
deletedAt: new Date() },
        });
        return count > 0;
    }

    findByUserId(userDataId: string): Promise<UserInstructorModel | null> {
        return this.prisma.userInstructor.findFirst({ where: { userDataId,
isDeleted: false } });
    }

    findAll(skip?: number, take?: number): Promise<UserInstructorWithUser[]> {
        return this.prisma.userInstructor.findMany({
            where: { isDeleted: false,
userData: { isDeleted: false } },
            include: { userData: { select: { id: true,
name: true } } },
            orderBy: { userData: { name: 'asc' } },
            skip,
            take,
        }) as Promise<UserInstructorWithUser[]>;
    }

    count(): Promise<number> {
        return this.prisma.userInstructor.count({
            where: { isDeleted: false,
userData: { isDeleted: false } },
        });
    }

    addToCourse(
        instructorId: string,
        courseId: string,
        title?: string,
        category?: string,
    ): Promise<CourseInstructorModel> {
        // Tirar um instrutor do curso é soft-delete, mas o unique
        // (instructorId, courseId) conta as linhas excluídas: sem o upsert,
        // colocar o mesmo instrutor de volta estourava o unique — o usecase só
        // enxerga os vínculos ativos e deixava o create passar.
        return this.prisma.courseInstructor.upsert({
            where: { instructorId_courseId: { instructorId,
courseId } },
            create: { instructorId,
courseId,
title,
category },
            update: { title,
category,
isDeleted: false,
deletedAt: null },
        });
    }

    async removeFromCourse(assignmentId: string): Promise<boolean> {
        try {
            await this.prisma.courseInstructor.update({
                where: { id: assignmentId },
                data: { isDeleted: true,
deletedAt: new Date() },
            });
            return true;
        } catch (e) {
            return semRegistro(e, false);
        }
    }

    findAssignmentById(assignmentId: string): Promise<CourseInstructorModel | null> {
        return this.prisma.courseInstructor.findFirst({
            where: { id: assignmentId,
isDeleted: false },
        });
    }

    findAssignment(instructorId: string, courseId: string): Promise<CourseInstructorModel | null> {
        return this.prisma.courseInstructor.findFirst({
            where: { instructorId,
courseId,
isDeleted: false },
        });
    }
}
