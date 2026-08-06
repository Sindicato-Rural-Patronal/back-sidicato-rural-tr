import type { CourseRepository } from '../ports/external/course-repository.js';
import type { RegistrationRepository } from '../ports/external/registration-repository.js';
import { CourseNotFoundError } from '../errors/not-found.js';
import { ValidationError } from '../errors/validation.js';

/**
 * Inicia o curso: só permite se houver inscrições e todas estiverem confirmadas.
 * Muda o status do curso para IN_PROGRESS.
 */
export class StartCourseUseCase {
    constructor(
        private readonly courseRepository: CourseRepository,
        private readonly registrationRepository: RegistrationRepository,
    ) {}

    async execute(courseId: string): Promise<{ error?: Error }> {
        const course = await this.courseRepository.findById(courseId);
        if (!course) return { error: new CourseNotFoundError() };

        const total = await this.registrationRepository.countByCourseId(courseId);
        if (total === 0) {
            return { error: new ValidationError('Não há inscrições neste curso.') };
        }
        const unconfirmed = await this.registrationRepository.countUnconfirmed(courseId);
        if (unconfirmed > 0) {
            return {
                error: new ValidationError(
                    `Há ${unconfirmed} inscrição(ões) não confirmada(s). Confirme todas antes de iniciar.`,
                ),
            };
        }

        await this.courseRepository.update(courseId, { status: 'IN_PROGRESS' });
        return {};
    }
}
