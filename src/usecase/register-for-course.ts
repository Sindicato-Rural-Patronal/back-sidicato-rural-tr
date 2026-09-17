import { z } from 'zod';
import type { CourseRepository } from '../ports/external/course-repository.js';
import type { UserDataRepository } from '../ports/external/user-data-repository.js';
import type { RegistrationRepository } from '../ports/external/registration-repository.js';
import { ValidationError } from '../errors/validation.js';
import { CourseNotFoundError } from '../errors/not-found.js';
import { CourseRegistrationAlreadyExistsError } from '../errors/conflict.js';
import { isValidCpf } from '../lib/cpf.js';
import { checkCourseAcceptsRegistration } from '../lib/course-registration-rules.js';
import { CourseFullError } from '../errors/business-rule.js';
import { isPrismaUniqueViolation } from '../lib/prisma-errors.js';
import { personEmailSchema } from '../lib/person-email.js';

const schema = z.object({
    courseId: z.string().min(1),
    name: z.string().min(1),
    phone: z.string().min(1),
    // Opcional (vazio = sem e-mail) e pode repetir entre pessoas.
    email: personEmailSchema,
    cpf: z.string().min(1),
});

type Request = z.infer<typeof schema>;
type Response = {
    error?: Error;
    registrationId?: string;
    userDataId?: string;
};

export class RegisterForCourseUseCase {
    constructor(
        private readonly courseRepository: CourseRepository,
        private readonly userDataRepository: UserDataRepository,
        private readonly registrationRepository: RegistrationRepository,
    ) {}

    async execute(request: Request): Promise<Response> {
        const parsed = schema.safeParse(request);
        if (!parsed.success) {
            return {
                error: new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid data'),
            };
        }

        const { courseId, name, phone, email, cpf } = parsed.data;

        if (!isValidCpf(cpf)) {
            return { error: new ValidationError('CPF inválido') };
        }

        const course = await this.courseRepository.findById(courseId);
        if (!course) {
            return { error: new CourseNotFoundError() };
        }
        const closed = checkCourseAcceptsRegistration(course);
        if (closed) return { error: closed };

        // A pessoa é identificada só pelo CPF: e-mail e telefone podem ser de outra
        // pessoa da família e não servem para achar o cadastro.
        let userData = await this.userDataRepository.findByCpf(cpf);

        if (!userData) {
            userData = await this.userDataRepository.create({
                name,
                phone,
                email: email ?? null,
                cpf,
            });
            if (!userData) {
                return { error: new Error('Failed to create user record') };
            }
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
            return { registrationId: created.id,
userDataId: userData.id };
        } catch (e) {
            // Corrida: índice único (courseId, userDataId) barra inscrição duplicada.
            if (isPrismaUniqueViolation(e)) {
                return { error: new CourseRegistrationAlreadyExistsError() };
            }
            throw e;
        }
    }
}
