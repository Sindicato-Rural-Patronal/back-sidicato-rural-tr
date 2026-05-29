import { CourseRepository } from '../ports/external/course-repository.js';
import { UserAdminRepository } from '../ports/external/user-admin-repository.js';
import { RuleRepository } from '../ports/external/rule-repository.js';
import { verifyPermission } from '../lib/verify-permission.js';

type DeleteCoursePhotoResponse = { success: boolean; statusCode?: number; error?: Error };

export class DeleteCoursePhotoUseCase {
    constructor(
        private readonly courseRepository: CourseRepository,
        private readonly userAdminRepository: UserAdminRepository,
        private readonly ruleRepository: RuleRepository,
    ) {}

    async execute(token: string, photoId: string): Promise<DeleteCoursePhotoResponse> {
        const auth = await verifyPermission(token, 'UPDATE_COURSE', this.userAdminRepository, this.ruleRepository);
        if (!auth.authorized) return { success: false, statusCode: auth.statusCode, error: new Error(auth.error) };

        const deleted = await this.courseRepository.deletePhoto(photoId);
        if (!deleted) return { success: false, error: new Error('Photo not found') };

        return { success: true };
    }
}
