import type { CourseRepository } from '../ports/external/course-repository.js';
import type { StorageRepository, UploadParams } from '../ports/external/storage-repository.js';
import { CourseNotFoundError } from '../errors/not-found.js';

const BANNER_BUCKET = process.env.BANNER_BUCKET || 'course-banners';

type AddCoursePhotoResponse = {
    error?: Error;
    url?: string;
    photoId?: string;
};

export class AddCoursePhotoUseCase {
    constructor(
        private readonly courseRepository: CourseRepository,
        private readonly storage: StorageRepository,
    ) {}

    async execute(
        courseId: string,
        fileBuffer: Buffer,
        originalFilename: string,
        caption?: string,
    ): Promise<AddCoursePhotoResponse> {
        console.log(
            `[AddCoursePhoto] courseId="${courseId}" file="${originalFilename}" caption="${caption ?? ''}"`,
        );
        const existing = await this.courseRepository.findById(courseId);
        if (!existing) {
            console.log(`[AddCoursePhoto] course not found: ${courseId}`);
            return { error: new CourseNotFoundError() };
        }

        const key = `courses/${courseId}/gallery/${Date.now()}-${originalFilename}`;
        const params: UploadParams = { bucket: BANNER_BUCKET,
key,
body: fileBuffer };
        await this.storage.uploadFile(params);
        const url = this.storage.getPublicUrl(BANNER_BUCKET, key);

        const photo = await this.courseRepository.addPhoto(courseId, url, caption);
        console.log(`[AddCoursePhoto] success photoId="${photo.id}" url="${url}"`);
        return { url,
photoId: photo.id };
    }
}
