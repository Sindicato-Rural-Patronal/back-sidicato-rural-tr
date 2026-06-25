import type { CourseRepository, CourseListFilters } from '../ports/external/course-repository.js';
import { CourseStatus } from '../ports/external/course-repository.js';
import type { CourseFrontendDetail } from './get-course-detail.js';
import { mapToFrontend } from './get-course-detail.js';

type PagedResult<T> = {
    data: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
};
type ListCoursesResponse = {
    error?: Error;
    result?: PagedResult<CourseFrontendDetail>;
};

export class ListCoursesUseCase {
    constructor(private readonly courseRepository: CourseRepository) {}

    async execute(onlyPublic = true, page = 1, limit = 20): Promise<ListCoursesResponse> {
        const filters: CourseListFilters = onlyPublic ? { status: CourseStatus.PUBLIC } : {};
        const skip = (page - 1) * limit;
        console.log(`[ListCourses] onlyPublic=${onlyPublic} page=${page} limit=${limit}`);
        const [courses, total] = await Promise.all([
            this.courseRepository.findAll(filters, skip, limit),
            this.courseRepository.count(filters),
        ]);
        return {
            result: {
                data: courses.map(mapToFrontend),
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };
    }
}
