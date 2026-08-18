import type { CourseWithDetails } from '../ports/external/course-repository.js';
import {
    RegistrationsUnavailableError,
    RegistrationDeadlinePassedError,
    CourseFullError,
} from '../errors/business-rule.js';

/**
 * Regras de negócio para aceitar uma inscrição num curso:
 * - status precisa aceitar inscrições (não UNPUBLISHED nem IN_PROGRESS)
 * - o prazo (registrationDeadline) não pode ter passado
 * - não pode exceder a capacidade da sala (room.maxCapacity)
 *
 * Retorna o erro correspondente ou `null` se pode inscrever.
 */
export function checkCourseAcceptsRegistration(course: CourseWithDetails): Error | null {
    if (course.status === 'UNPUBLISHED' || course.status === 'IN_PROGRESS') {
        return new RegistrationsUnavailableError();
    }
    if (course.registrationDeadline && course.registrationDeadline.getTime() < Date.now()) {
        return new RegistrationDeadlinePassedError();
    }
    if (course._count.courseUserRegistration >= course.room.maxCapacity) {
        return new CourseFullError();
    }
    return null;
}
