import type { CourseRepository, CourseWithDetails, CourseStatus } from '../ports/external/course-repository.js';
import type { UserAdminRepository } from '../ports/external/user-admin-repository.js';
import type { RuleRepository } from '../ports/external/rule-repository.js';
import { verifyPermission } from '../lib/verify-permission.js';

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

type PagedResult<T> = { data: T[]; total: number; page: number; limit: number; totalPages: number };
type ListAllCoursesResponse = { success: boolean; statusCode?: number; error?: Error; result?: PagedResult<CourseCardItem> };

export class ListAllCoursesUseCase {
    constructor(
        private courseRepository: CourseRepository,
        private userAdminRepository: UserAdminRepository,
        private ruleRepository: RuleRepository
    ) {}

    async execute(token: string, page = 1, limit = 20): Promise<ListAllCoursesResponse> {
        console.log(`[ListAllCourses] page=${page} limit=${limit}`);
        const auth = await verifyPermission(token, 'READ_COURSE', this.userAdminRepository, this.ruleRepository);
        if (!auth.authorized) {
            console.log(`[ListAllCourses] denied: ${auth.error}`);
            return { success: false, statusCode: auth.statusCode, error: new Error(auth.error) };
        }
        const skip = (page - 1) * limit;
        const [courses, total] = await Promise.all([
            this.courseRepository.findAll(undefined, skip, limit),
            this.courseRepository.count(),
        ]);
        console.log(`[ListAllCourses] total=${total}`);
        return { success: true, result: { data: courses.map(mapToCard), total, page, limit, totalPages: Math.ceil(total / limit) } };
    }
}
