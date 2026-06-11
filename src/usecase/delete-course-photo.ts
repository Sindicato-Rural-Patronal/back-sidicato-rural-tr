import type { CourseRepository } from '../ports/external/course-repository.js';
import { PhotoNotFoundError } from '../errors/not-found.js';

type DeleteCoursePhotoResponse = { error?: Error };

export class DeleteCoursePhotoUseCase {
    constructor(private readonly courseRepository: CourseRepository) {}

    async execute(photoId: string): Promise<DeleteCoursePhotoResponse> {
        console.log(`[DeleteCoursePhoto] photoId="${photoId}"`);
        const deleted = await this.courseRepository.deletePhoto(photoId);
        if (!deleted) {
            console.log(`[DeleteCoursePhoto] photo not found: ${photoId}`);
            return { error: new PhotoNotFoundError() };
        }

        console.log(`[DeleteCoursePhoto] success`);
        return {};
    }
}
