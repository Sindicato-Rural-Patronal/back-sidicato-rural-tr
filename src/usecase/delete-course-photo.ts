import type { CourseRepository } from '../ports/external/course-repository.js';
import { PhotoNotFoundError } from '../errors/not-found.js';

type DeleteCoursePhotoResponse = { error?: Error };

export class DeleteCoursePhotoUseCase {
    constructor(private readonly courseRepository: CourseRepository) {}

    async execute(photoId: string): Promise<DeleteCoursePhotoResponse> {
        const deleted = await this.courseRepository.deletePhoto(photoId);
        if (!deleted) {
            return { error: new PhotoNotFoundError() };
        }

        return {};
    }
}
