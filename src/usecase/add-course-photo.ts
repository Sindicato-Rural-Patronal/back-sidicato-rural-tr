import type { CourseRepository } from '../ports/external/course-repository.js';
import type { UserAdminRepository } from '../ports/external/user-admin-repository.js';
import type { RuleRepository } from '../ports/external/rule-repository.js';
import type { StorageRepository, UploadParams } from '../ports/external/storage-repository.js';
import { verifyPermission } from '../lib/verify-permission.js';

const BANNER_BUCKET = process.env.BANNER_BUCKET || 'course-banners';

type AddCoursePhotoResponse = { success: boolean; statusCode?: number; error?: Error; url?: string; photoId?: string };

export class AddCoursePhotoUseCase {
    constructor(
        private readonly courseRepository: CourseRepository,
        private readonly storage: StorageRepository,
        private readonly userAdminRepository: UserAdminRepository,
        private readonly ruleRepository: RuleRepository,
    ) {}

    async execute(token: string, courseId: string, fileBuffer: Buffer, originalFilename: string, caption?: string): Promise<AddCoursePhotoResponse> {
        console.log(`[AddCoursePhoto] courseId="${courseId}" file="${originalFilename}" caption="${caption ?? ''}"`);
        const auth = await verifyPermission(token, 'UPDATE_COURSE', this.userAdminRepository, this.ruleRepository);
        if (!auth.authorized) {
            console.log(`[AddCoursePhoto] denied: ${auth.error}`);
            return { success: false, statusCode: auth.statusCode, error: new Error(auth.error) };
        }

        const existing = await this.courseRepository.findById(courseId);
        if (!existing) {
            console.log(`[AddCoursePhoto] course not found: ${courseId}`);
            return { success: false, error: new Error('Course not found') };
        }

        const key = `courses/${courseId}/gallery/${Date.now()}-${originalFilename}`;
        const params: UploadParams = { bucket: BANNER_BUCKET, key, body: fileBuffer };
        await this.storage.uploadFile(params);
        const url = this.storage.getPublicUrl(BANNER_BUCKET, key);

        const photo = await this.courseRepository.addPhoto(courseId, url, caption);
        console.log(`[AddCoursePhoto] success photoId="${photo.id}" url="${url}"`);
        return { success: true, url, photoId: photo.id };
    }
}
