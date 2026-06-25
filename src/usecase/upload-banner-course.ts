import sharp from 'sharp';
import type { StorageRepository, UploadParams } from '../ports/external/storage-repository.js';
import type { CourseRepository } from '../ports/external/course-repository.js';
import { CourseNotFoundError } from '../errors/not-found.js';

const FULL_HD_WIDTH = 1920;
const FULL_HD_HEIGHT = 1080;
const BANNER_BUCKET = process.env.BANNER_BUCKET || 'course-banners';

type UploadCourseBannerResponse = { error?: Error; url?: string };

export class UploadCourseBannerUseCase {
    constructor(
        private storage: StorageRepository,
        private courseRepository: CourseRepository,
    ) {}

    async execute(courseId: string, fileBuffer: Buffer): Promise<UploadCourseBannerResponse> {
        const course = await this.courseRepository.findById(courseId);
        if (!course) return { error: new CourseNotFoundError() };

        console.log(`[UploadCourseBanner] courseId="${courseId}" bufferSize=${fileBuffer.length}`);
        const processedBuffer = await sharp(fileBuffer)
            .resize(FULL_HD_WIDTH, FULL_HD_HEIGHT, { fit: 'cover', position: 'center' })
            .jpeg({ quality: 85 })
            .toBuffer();

        const key = `courses/${courseId}/banner.jpg`;
        const params: UploadParams = {
            bucket: BANNER_BUCKET,
            key,
            body: processedBuffer,
            contentType: 'image/jpeg',
        };

        await this.storage.uploadFile(params);

        const publicUrl = this.storage.getPublicUrl(BANNER_BUCKET, key);
        const urlWithBust = `${publicUrl}?t=${Date.now()}`;

        await this.courseRepository.update(courseId, { bannerUrl: urlWithBust });
        console.log(`[UploadCourseBanner] success url="${urlWithBust}"`);

        return { url: urlWithBust };
    }
}
