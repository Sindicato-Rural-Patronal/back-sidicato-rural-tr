import type { CourseRepository } from '../ports/external/course-repository.js';
import type { UserDataRepository } from '../ports/external/user-data-repository.js';
import type { RegistrationRepository } from '../ports/external/registration-repository.js';
import { CourseNotFoundError, UserDataNotFoundError } from '../errors/not-found.js';
import { ConflictError } from '../errors/conflict.js';
import { CourseFullError } from '../errors/business-rule.js';
import { ValidationError } from '../errors/validation.js';
import { isPrismaUniqueViolation } from '../lib/prisma-errors.js';

export class PersonAlreadyRegisteredError extends ConflictError {
    constructor() {
        super('Pessoa já inscrita neste curso');
        this.name = 'PersonAlreadyRegisteredError';
    }
}

type AdminRegisterRequest = {
    courseId: string;
    userDataId: string;
};

/**
 * Inscrição feita pela equipe no painel, escolhendo uma pessoa do cadastro.
 * Diferente da inscrição pública, não olha prazo, status nem data de término
 * (a equipe pode incluir alguém depois); só a lotação da sala, com a mesma
 * contagem atômica da inscrição pública (`createWithCapacity`). A inscrição já
 * nasce confirmada.
 */
export class AdminRegisterPersonUseCase {
    constructor(
        private readonly courseRepository: CourseRepository,
        private readonly userDataRepository: UserDataRepository,
        private readonly registrationRepository: RegistrationRepository,
    ) {}

    async execute(request: AdminRegisterRequest): Promise<{
        error?: Error;
        registrationId?: string;
    }> {
        const courseId = request.courseId?.trim();
        const userDataId = request.userDataId?.trim();
        if (!courseId || !userDataId) {
            return { error: new ValidationError('Informe a pessoa a inscrever.') };
        }

        const course = await this.courseRepository.findById(courseId);
        if (!course) return { error: new CourseNotFoundError() };

        const person = await this.userDataRepository.findById(userDataId);
        if (!person) return { error: new UserDataNotFoundError() };

        const existing = await this.registrationRepository.findByUserDataAndCourse(userDataId, courseId);
        if (existing) return { error: new PersonAlreadyRegisteredError() };

        try {
            const created = await this.registrationRepository.createWithCapacity(
                courseId,
                userDataId,
                course.room.maxCapacity,
                { confirmed: true },
            );
            if (created === 'FULL') return { error: new CourseFullError() };
            return { registrationId: created.id };
        } catch (e) {
            // Corrida: o índice único (courseId, userDataId) barra a inscrição repetida.
            if (isPrismaUniqueViolation(e)) return { error: new PersonAlreadyRegisteredError() };
            throw e;
        }
    }
}

/** Confirma de uma vez todas as inscrições ainda não confirmadas do curso. */
export class ConfirmAllRegistrationsUseCase {
    constructor(
        private readonly courseRepository: CourseRepository,
        private readonly registrationRepository: RegistrationRepository,
    ) {}

    async execute(courseId: string): Promise<{
        error?: Error;
        confirmed?: number;
    }> {
        const course = await this.courseRepository.findById(courseId);
        if (!course) return { error: new CourseNotFoundError() };

        const confirmed = await this.registrationRepository.confirmAll(courseId);
        return { confirmed };
    }
}
