import type { InstructorRepository } from '../ports/external/instructor-repository.js';
import type { CourseRepository } from '../ports/external/course-repository.js';
import { CourseNotFoundError, InstructorNotFoundError } from '../errors/not-found.js';
import { InstructorAlreadyAssignedError } from '../errors/conflict.js';

type AddInstructorToCourseRequest = {
    courseId: string;
    instructorUserDataId: string;
    title?: string;
    category?: string;
};
type AddInstructorToCourseResponse = { error?: Error; assignmentId?: string };

export class AddInstructorToCourseUseCase {
    constructor(
        private readonly instructorRepository: InstructorRepository,
        private readonly courseRepository: CourseRepository,
    ) {}

    async execute(request: AddInstructorToCourseRequest): Promise<AddInstructorToCourseResponse> {
        const course = await this.courseRepository.findById(request.courseId);
        if (!course) return { error: new CourseNotFoundError() };

        const instructor = await this.instructorRepository.findByUserId(request.instructorUserDataId);
        if (!instructor) return { error: new InstructorNotFoundError() };

        const existing = await this.instructorRepository.findAssignment(instructor.id, request.courseId);
        if (existing) return { error: new InstructorAlreadyAssignedError() };

        const assignment = await this.instructorRepository.addToCourse(
            instructor.id,
            request.courseId,
            request.title,
            request.category,
        );
        return { assignmentId: assignment.id };
    }
}
