import { z } from 'zod';
import type { CourseRepository } from '../ports/external/course-repository.js';
import type { UserDataRepository } from '../ports/external/user-data-repository.js';
import type { RegistrationRepository } from '../ports/external/registration-repository.js';
import { ValidationError } from '../errors/validation.js';
import { CourseNotFoundError, CpfPhoneNotFoundError } from '../errors/not-found.js';
import { TooManyAttemptsError } from '../errors/too-many-attempts.js';
import { CourseRegistrationAlreadyExistsError } from '../errors/conflict.js';
import { isValidCpf } from '../lib/cpf.js';
import { parsePhoneEnd, phoneEndMatches } from '../lib/phone-match.js';
import type { CpfAttemptLimiter } from '../lib/cpf-attempt-limiter.js';
import { checkCourseAcceptsRegistration } from '../lib/course-registration-rules.js';
import { CourseFullError } from '../errors/business-rule.js';
import { isPrismaUniqueViolation } from '../lib/prisma-errors.js';
import type { NotificationPublisher } from '../ports/external/notification-repository.js';
import { courseRegistrationEvent, publishSafely } from '../lib/notification-events.js';

const schema = z.object({
    courseId: z.string().min(1),
    cpf: z.string().min(1),
    phoneEnd: z.string(),
});

type Request = z.infer<typeof schema>;
type Response = {
    error?: Error;
    registrationId?: string;
    userDataId?: string;
};

/**
 * Inscrição pública de quem já tem cadastro: CPF + 4 últimos dígitos de um dos
 * telefones do cadastro. CPF sem cadastro e telefone que não confere dão o
 * mesmo 404 (SR-025), e os dois contam no limite por CPF.
 */
export class RegisterForCourseByCpfUseCase {
    constructor(
        private readonly courseRepository: CourseRepository,
        private readonly userDataRepository: UserDataRepository,
        private readonly registrationRepository: RegistrationRepository,
        private readonly notifications: NotificationPublisher,
        private readonly attempts: CpfAttemptLimiter,
    ) {}

    async execute(request: Request): Promise<Response> {
        const parsed = schema.safeParse(request);
        if (!parsed.success) {
            return {
                error: new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos.'),
            };
        }

        const { courseId, cpf } = parsed.data;

        if (!isValidCpf(cpf)) {
            return { error: new ValidationError('CPF inválido') };
        }
        const phoneEnd = parsePhoneEnd(parsed.data.phoneEnd);
        if (!phoneEnd) {
            return { error: new ValidationError('Informe os 4 últimos dígitos do telefone.') };
        }

        const course = await this.courseRepository.findById(courseId);
        if (!course) {
            return { error: new CourseNotFoundError() };
        }
        const closed = checkCourseAcceptsRegistration(course);
        if (closed) return { error: closed };

        if (this.attempts.isBlocked(cpf)) return { error: new TooManyAttemptsError() };
        const userData = await this.userDataRepository.findByCpf(cpf);
        if (!userData || !phoneEndMatches(userData, phoneEnd)) {
            this.attempts.recordFailure(cpf);
            return { error: new CpfPhoneNotFoundError() };
        }

        const existing = await this.registrationRepository.findByUserDataAndCourse(
            userData.id,
            courseId,
        );
        if (existing) {
            return { error: new CourseRegistrationAlreadyExistsError() };
        }

        try {
            const created = await this.registrationRepository.createWithCapacity(
                courseId,
                userData.id,
                course.room.maxCapacity,
            );
            if (created === 'FULL') return { error: new CourseFullError() };
            await publishSafely(this.notifications, courseRegistrationEvent({
                courseId,
                courseName: course.name,
                personName: userData.name,
                registrationId: created.id,
            }));
            return { registrationId: created.id,
userDataId: userData.id };
        } catch (e) {
            if (isPrismaUniqueViolation(e)) {
                return { error: new CourseRegistrationAlreadyExistsError() };
            }
            throw e;
        }
    }
}
