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
        console.log(`[GetAdminCourseDetail] courseId="${courseId}"`);
        const course = await this.courseRepository.findById(courseId);
        if (!course) {
            console.log(`[GetAdminCourseDetail] not found: ${courseId}`);
            return { error: new CourseNotFoundError() };
        }

        console.log(
            `[GetAdminCourseDetail] found: name="${course.name}" status="${course.status}"`,
        );
        return { course: mapToFrontend(course) };
    }
}
