import type { CourseRepository } from '../ports/external/course-repository.js';
import type { RegistrationRepository } from '../ports/external/registration-repository.js';
import { CourseNotFoundError } from '../errors/not-found.js';
import { ValidationError } from '../errors/validation.js';

/**
 * Inicia o curso: só exige que haja ao menos uma inscrição. Inscrições ainda
 * não confirmadas não impedem (quem não veio é marcado como falta na presença);
 * o painel só avisa quantas faltam confirmar.
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
        if (course.status === 'COMPLETED') {
            return { error: new ValidationError('Este curso já foi concluído. Para reabrir, edite o status.') };
        }

        const total = await this.registrationRepository.countByCourseId(courseId);
        if (total === 0) {
            return { error: new ValidationError('Não há inscrições neste curso.') };
        }

        await this.courseRepository.update(courseId, { status: 'IN_PROGRESS' });
        return {};
    }
}
