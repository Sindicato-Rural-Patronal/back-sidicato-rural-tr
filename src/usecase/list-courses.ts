import type { CourseRepository} from '../ports/external/course-repository.js';
import { CourseStatus } from '../ports/external/course-repository.js';
import type { CourseFrontendDetail} from './get-course-detail.js';
import { mapToFrontend } from './get-course-detail.js';

type ListCoursesResponse = {
    success: boolean;
    error?: Error;
    courses?: CourseFrontendDetail[];
};

export class ListCoursesUseCase {
    constructor(private readonly courseRepository: CourseRepository) {}

    async execute(onlyPublic = true): Promise<ListCoursesResponse> {
        const statusFilter = onlyPublic ? CourseStatus.PUBLICO : undefined;
        const courses = await this.courseRepository.findAll(statusFilter);
        return { success: true, courses: courses.map(mapToFrontend) };
    }
}
