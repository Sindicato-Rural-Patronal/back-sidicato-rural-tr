import type { CourseRepository, CourseListFilters } from '../ports/external/course-repository.js';
import { CourseStatus } from '../ports/external/course-repository.js';
import type { CourseFrontendDetail } from './get-course-detail.js';
import { mapToFrontend } from './get-course-detail.js';
import { paginate, type PagedResult } from '../lib/pagination.js';

type ListCoursesResponse = {
    error?: Error;
    result?: PagedResult<CourseFrontendDetail>;
};

export class ListCoursesUseCase {
    constructor(private readonly courseRepository: CourseRepository) {}

    async execute(onlyPublic = true, page = 1, limit = 20): Promise<ListCoursesResponse> {
        const filters: CourseListFilters = onlyPublic ? { status: CourseStatus.PUBLIC } : {};
        return {
            result: await paginate(
                page,
                limit,
                (skip, take) =>
                    this.courseRepository.findAll(filters, skip, take).then(cs => cs.map(mapToFrontend)),
                () => this.courseRepository.count(filters),
            ),
        };
    }
}
