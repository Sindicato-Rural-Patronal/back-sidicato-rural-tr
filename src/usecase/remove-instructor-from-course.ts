import type { InstructorRepository } from '../ports/external/instructor-repository.js';
import { InstructorNotFoundError } from '../errors/not-found.js';

type RemoveInstructorFromCourseResponse = { error?: Error };

export class RemoveInstructorFromCourseUseCase {
    constructor(private readonly instructorRepository: InstructorRepository) {}

    async execute(assignmentId: string): Promise<RemoveInstructorFromCourseResponse> {
        const assignment = await this.instructorRepository.findAssignmentById(assignmentId);
        if (!assignment) return { error: new InstructorNotFoundError() };

        await this.instructorRepository.removeFromCourse(assignmentId);
        return {};
    }
}
