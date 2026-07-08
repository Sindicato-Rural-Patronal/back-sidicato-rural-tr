import type { CourseRepository } from '../ports/external/course-repository.js';
import type { CourseFrontendDetail } from './get-course-detail.js';
import { mapToFrontend } from './get-course-detail.js';
import { CourseNotFoundError } from '../errors/not-found.js';

type GetAdminCourseDetailResponse = {
    error?: Error;
    course?: CourseFrontendDetail;
};

export class GetAdminCourseDetailUseCase {
    constructor(private readonly courseRepository: CourseRepository) {}

    async execute(courseId: string): Promise<GetAdminCourseDetailResponse> {
        const course = await this.courseRepository.findById(courseId);
        if (!course) {
            return { error: new CourseNotFoundError() };
        }

        return { course: mapToFrontend(course) };
    }
}
