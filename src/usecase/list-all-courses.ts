import type {
    CourseRepository,
    CourseWithDetails,
    CourseStatus,
    CourseListFilters,
} from '../ports/external/course-repository.js';
import { paginate, type PagedResult } from '../lib/pagination.js';

export type CourseCardItem = {
    id: string;
    status: CourseStatus;
    title: string;
    eventNumber: string | null;
    startDate: string;
    enrolled: number;
    maxStudents: number;
    price: number;
    coverImage: string | null;
    photoCount: number;
};

export function mapToCard(course: CourseWithDetails): CourseCardItem {
    return {
        id: course.id,
        status: course.status,
        title: course.name,
        eventNumber: course.eventNumber ?? null,
        startDate: course.startTime.toISOString().split('T')[0],
        enrolled: course._count.courseUserRegistration,
        maxStudents: course.room.maxCapacity,
        price: course.price,
        coverImage: course.bannerUrl ?? null,
        photoCount: course.photos.length,
    };
}

type ListAllCoursesResponse = {
    error?: Error;
    result?: PagedResult<CourseCardItem>;
};

export class ListAllCoursesUseCase {
    constructor(private courseRepository: CourseRepository) {}

    async execute(page = 1, limit = 20, filters?: CourseListFilters): Promise<ListAllCoursesResponse> {
        return {
            result: await paginate(
                page,
                limit,
                (skip, take) =>
                    this.courseRepository.findAll(filters, skip, take).then(cs => cs.map(mapToCard)),
                () => this.courseRepository.count(filters),
            ),
        };
    }
}
