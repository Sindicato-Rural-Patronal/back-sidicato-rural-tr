import type { CourseRepository } from '../ports/external/course-repository.js';
import type { UserAdminRepository } from '../ports/external/user-admin-repository.js';
import type { RuleRepository } from '../ports/external/rule-repository.js';
import type { CourseFrontendDetail } from './get-course-detail.js';
import { mapToFrontend } from './get-course-detail.js';
import { verifyPermission } from '../lib/verify-permission.js';

type GetAdminCourseDetailResponse = {
    success: boolean;
    statusCode?: number;
    error?: Error;
    course?: CourseFrontendDetail;
};

export class GetAdminCourseDetailUseCase {
    constructor(
        private readonly courseRepository: CourseRepository,
        private readonly userAdminRepository: UserAdminRepository,
        private readonly ruleRepository: RuleRepository,
    ) {}

    async execute(token: string, courseId: string): Promise<GetAdminCourseDetailResponse> {
        console.log(`[GetAdminCourseDetail] courseId="${courseId}"`);
        const auth = await verifyPermission(token, 'READ_COURSE', this.userAdminRepository, this.ruleRepository);
        if (!auth.authorized) {
            console.log(`[GetAdminCourseDetail] denied: ${auth.error}`);
            return { success: false, statusCode: auth.statusCode, error: new Error(auth.error) };
        }

        const course = await this.courseRepository.findById(courseId);
        if (!course) {
            console.log(`[GetAdminCourseDetail] not found: ${courseId}`);
            return { success: false, statusCode: 404, error: new Error('Course not found') };
        }

        console.log(`[GetAdminCourseDetail] found: name="${course.name}" status="${course.status}"`);
        return { success: true, course: mapToFrontend(course) };
    }
}
