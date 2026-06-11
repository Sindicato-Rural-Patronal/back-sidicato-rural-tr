import type { CourseRepository } from '../ports/external/course-repository.js';
import { CourseNotFoundError } from '../errors/not-found.js';

type DeleteCourseResponse = { error?: Error };

export class DeleteCourseUseCase {
    constructor(private readonly courseRepository: CourseRepository) {}

    async execute(courseId: string): Promise<DeleteCourseResponse> {
        console.log(`[DeleteCourse] courseId="${courseId}"`);
        const existing = await this.courseRepository.findById(courseId);
        if (!existing) {
            console.log(`[DeleteCourse] course not found: ${courseId}`);
            return { error: new CourseNotFoundError() };
        }

        const deleted = await this.courseRepository.delete(courseId);
        if (!deleted) return { error: new Error('Failed to delete course') };

        console.log(`[DeleteCourse] success`);
        return {};
    }
}
