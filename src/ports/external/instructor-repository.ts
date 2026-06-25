import type { UserInstructorModel, CourseInstructorModel } from '../../generated/prisma/models.js';

export type UserInstructorWithUser = UserInstructorModel & {
    userData: { id: string; name: string };
};

export type InstructorUpdateData = {
    bio?: string | null;
    linkedin?: string | null;
    instagram?: string | null;
    facebook?: string | null;
};

export interface InstructorRepository {
    promote(userDataId: string, bio?: string, linkedin?: string, instagram?: string, facebook?: string): Promise<UserInstructorModel>;
    update(userDataId: string, data: InstructorUpdateData): Promise<UserInstructorModel | null>;
    demote(userDataId: string): Promise<boolean>;
    findByUserId(userDataId: string): Promise<UserInstructorModel | null>;
    findAll(skip?: number, take?: number): Promise<UserInstructorWithUser[]>;
    count(): Promise<number>;
    addToCourse(
        instructorId: string,
        courseId: string,
        title?: string,
        category?: string,
    ): Promise<CourseInstructorModel>;
    removeFromCourse(assignmentId: string): Promise<boolean>;
    findAssignmentById(assignmentId: string): Promise<CourseInstructorModel | null>;
    findAssignment(instructorId: string, courseId: string): Promise<CourseInstructorModel | null>;
}
