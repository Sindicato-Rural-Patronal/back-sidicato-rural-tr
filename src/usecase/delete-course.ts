import type { CourseRepository } from '../ports/external/course-repository.js';
import type { UserAdminRepository } from '../ports/external/user-admin-repository.js';
import type { RuleRepository } from '../ports/external/rule-repository.js';
import { verifyPermission } from '../lib/verify-permission.js';

type DeleteCourseResponse = { success: boolean; statusCode?: number; error?: Error };

export class DeleteCourseUseCase {
    constructor(
        private readonly courseRepository: CourseRepository,
        private readonly userAdminRepository: UserAdminRepository,
        private readonly ruleRepository: RuleRepository,
    ) {}

    async execute(token: string, courseId: string): Promise<DeleteCourseResponse> {
        console.log(`[DeleteCourse] courseId="${courseId}"`);
        const auth = await verifyPermission(token, 'DELETE_COURSE', this.userAdminRepository, this.ruleRepository);
        if (!auth.authorized) {
            console.log(`[DeleteCourse] denied: ${auth.error}`);
            return { success: false, statusCode: auth.statusCode, error: new Error(auth.error) };
        }

        const existing = await this.courseRepository.findById(courseId);
        if (!existing) {
            console.log(`[DeleteCourse] course not found: ${courseId}`);
            return { success: false, error: new Error('Course not found') };
        }

        const deleted = await this.courseRepository.delete(courseId);
        if (!deleted) return { success: false, error: new Error('Failed to delete course') };

        console.log(`[DeleteCourse] success`);
        return { success: true };
    }
}
