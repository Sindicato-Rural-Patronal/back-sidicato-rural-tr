import type { CourseRepository } from '../ports/external/course-repository.js';
import type { RegistrationRepository } from '../ports/external/registration-repository.js';
import { CourseNotFoundError, RegistrationNotFoundError } from '../errors/not-found.js';
import { ValidationError } from '../errors/validation.js';

/** Presença de uma inscrição: true = presente, false = faltou, null = desmarcar. */
export class SetRegistrationAttendanceUseCase {
    constructor(private readonly registrationRepository: RegistrationRepository) {}

    async execute(id: string, attended: unknown): Promise<{
        error?: Error;
        registration?: {
 id: string;
attended: boolean | null 
};
    }> {
        if (attended !== true && attended !== false && attended !== null) {
            return { error: new ValidationError('Informe a presença: presente, faltou ou sem marcar.') };
        }
        const reg = await this.registrationRepository.findById(id);
        if (!reg) return { error: new RegistrationNotFoundError() };

        const updated = await this.registrationRepository.setAttended(id, attended);
        return { registration: { id: updated.id,
attended: updated.attended } };
    }
}

/**
 * Marca de uma vez a presença das inscrições confirmadas do curso que ainda estão
 * sem marcar ("Todos presentes"). Quem já foi marcado (presente ou falta) e as
 * inscrições não confirmadas ficam como estão.
 */
export class SetUnmarkedAttendanceUseCase {
    constructor(
        private readonly courseRepository: CourseRepository,
        private readonly registrationRepository: RegistrationRepository,
    ) {}

    async execute(courseId: string, attended: unknown): Promise<{
        error?: Error;
        updated?: number;
    }> {
        if (typeof attended !== 'boolean') {
            return { error: new ValidationError('Informe a presença: presente ou faltou.') };
        }
        const course = await this.courseRepository.findById(courseId);
        if (!course) return { error: new CourseNotFoundError() };

        const updated = await this.registrationRepository.setAttendedForUnmarked(courseId, attended);
        return { updated };
    }
}
