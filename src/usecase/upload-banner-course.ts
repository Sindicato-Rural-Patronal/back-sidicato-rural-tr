import sharp from 'sharp';
import type { StorageRepository, UploadParams } from '../ports/external/storage-repository.js';
import type { CourseRepository } from '../ports/external/course-repository.js';
import { CourseNotFoundError } from '../errors/not-found.js';
import { ValidationError } from '../errors/validation.js';
import { validateImageUpload } from '../lib/image-upload.js';

import { buckets } from '../lib/buckets.js';

const FULL_HD_WIDTH = 1920;
const FULL_HD_HEIGHT = 1080;
// Miniatura para os cards (~350px na tela; 640px cobre telas de densidade 2x).
export const THUMB_WIDTH = 640;
export const THUMB_HEIGHT = 360;
const BANNER_BUCKET = buckets.courseBanners;

type UploadCourseBannerResponse = {
 error?: Error;
url?: string;
thumbUrl?: string | null
};

export class UploadCourseBannerUseCase {
    constructor(
        private storage: StorageRepository,
        private courseRepository: CourseRepository,
    ) {}

    async execute(courseId: string, fileBuffer: Buffer, mimeType: string): Promise<UploadCourseBannerResponse> {
        const invalid = validateImageUpload(fileBuffer, mimeType);
        if (invalid) return { error: new ValidationError(invalid) };

        const course = await this.courseRepository.findById(courseId);
        if (!course) return { error: new CourseNotFoundError() };

        const processedBuffer = await sharp(fileBuffer)
            .resize(FULL_HD_WIDTH, FULL_HD_HEIGHT, { fit: 'cover',
position: 'center' })
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

        const bust = Date.now();
        const urlWithBust = `${this.storage.getPublicUrl(BANNER_BUCKET, key)}?t=${bust}`;
        const thumbUrl = await this.uploadThumb(courseId, processedBuffer, bust);

        // A miniatura acompanha sempre a capa: nova capa → nova miniatura (ou null
        // se falhou, e os cards voltam a usar a capa inteira em vez da antiga).
        await this.courseRepository.update(courseId, { bannerUrl: urlWithBust,
bannerThumbUrl: thumbUrl });

        return { url: urlWithBust,
thumbUrl };
    }

    // Mesma chave a cada envio (sobrescreve a anterior). Falha aqui não impede a
    // troca da capa — só deixa o curso sem miniatura.
    private async uploadThumb(courseId: string, coverBuffer: Buffer, bust: number): Promise<string | null> {
        try {
            const thumbBuffer = await sharp(coverBuffer)
                .resize(THUMB_WIDTH, THUMB_HEIGHT, { fit: 'cover',
position: 'center' })
                .webp({ quality: 75 })
                .toBuffer();
            const key = `courses/${courseId}/banner-thumb.webp`;
            await this.storage.uploadFile({
                bucket: BANNER_BUCKET,
                key,
                body: thumbBuffer,
                contentType: 'image/webp',
            });
            return `${this.storage.getPublicUrl(BANNER_BUCKET, key)}?t=${bust}`;
        } catch {
            return null;
        }
    }
}
