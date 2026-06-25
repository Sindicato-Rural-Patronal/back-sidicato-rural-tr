import type { PrismaClient } from '@prisma/client/extension';
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
        return this.prisma.userInstructor.create({ data: { userDataId, bio, linkedin, instagram, facebook } });
    }

    update(userDataId: string, data: InstructorUpdateData): Promise<UserInstructorModel | null> {
        return this.prisma.userInstructor.update({ where: { userDataId }, data });
    }

    async demote(userDataId: string): Promise<boolean> {
        try {
            await this.prisma.userInstructor.delete({ where: { userDataId } });
            return true;
        } catch {
            return false;
        }
    }

    findByUserId(userDataId: string): Promise<UserInstructorModel | null> {
        return this.prisma.userInstructor.findUnique({ where: { userDataId } });
    }

    findAll(skip?: number, take?: number): Promise<UserInstructorWithUser[]> {
        return this.prisma.userInstructor.findMany({
            include: { userData: { select: { id: true, name: true } } },
            orderBy: { userData: { name: 'asc' } },
            skip,
            take,
        }) as Promise<UserInstructorWithUser[]>;
    }

    count(): Promise<number> {
        return this.prisma.userInstructor.count();
    }

    addToCourse(
        instructorId: string,
        courseId: string,
        title?: string,
        category?: string,
    ): Promise<CourseInstructorModel> {
        return this.prisma.courseInstructor.create({
            data: { instructorId, courseId, title, category },
        });
    }

    async removeFromCourse(assignmentId: string): Promise<boolean> {
        try {
            await this.prisma.courseInstructor.update({
                where: { id: assignmentId },
                data: { isDeleted: true, deletedAt: new Date() },
            });
            return true;
        } catch {
            return false;
        }
    }

    findAssignmentById(assignmentId: string): Promise<CourseInstructorModel | null> {
        return this.prisma.courseInstructor.findFirst({
            where: { id: assignmentId, isDeleted: false },
        });
    }

    findAssignment(instructorId: string, courseId: string): Promise<CourseInstructorModel | null> {
        return this.prisma.courseInstructor.findFirst({
            where: { instructorId, courseId, isDeleted: false },
        });
    }
}
