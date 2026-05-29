import type { CourseRepository } from '../ports/external/course-repository.js';
import type { UserAdminRepository } from '../ports/external/user-admin-repository.js';
import type { RuleRepository } from '../ports/external/rule-repository.js';
import type { CourseFrontendDetail} from './get-course-detail.js';
import { mapToFrontend } from './get-course-detail.js';
import { verifyPermission } from '../lib/verify-permission.js';

type ListAllCoursesResponse = {
    success: boolean;
    statusCode?: number;
    error?: Error;
    courses?: CourseFrontendDetail[];
};

export class ListAllCoursesUseCase {
    constructor(
        private courseRepository: CourseRepository,
        private userAdminRepository: UserAdminRepository,
        private ruleRepository: RuleRepository
    ) {}

    async execute(token: string): Promise<ListAllCoursesResponse> {
        const auth = await verifyPermission(token, 'READ_COURSE', this.userAdminRepository, this.ruleRepository);
        if (!auth.authorized) return { success: false, statusCode: auth.statusCode, error: new Error(auth.error) };
        const courses = await this.courseRepository.findAll();
        return { success: true, courses: courses.map(mapToFrontend) };
    }
}
