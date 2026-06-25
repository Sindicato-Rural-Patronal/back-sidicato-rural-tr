import { z } from 'zod';
import type { CourseRepository } from '../ports/external/course-repository.js';
import type { UserDataRepository } from '../ports/external/user-data-repository.js';
import type { RegistrationRepository } from '../ports/external/registration-repository.js';
import { ValidationError } from '../errors/validation.js';
import { CourseNotFoundError, UserDataNotFoundError } from '../errors/not-found.js';
import { CourseRegistrationAlreadyExistsError } from '../errors/conflict.js';
import { RegistrationsUnavailableError } from '../errors/business-rule.js';
import { isValidCpf } from '../lib/cpf.js';

const schema = z.object({
    courseId: z.string().min(1),
    cpf: z.string().min(1),
});

type Request = z.infer<typeof schema>;
type Response = {
    error?: Error;
    registrationId?: string;
    userDataId?: string;
};

export class RegisterForCourseByCpfUseCase {
    constructor(
        private readonly courseRepository: CourseRepository,
        private readonly userDataRepository: UserDataRepository,
        private readonly registrationRepository: RegistrationRepository,
    ) {}

    async execute(request: Request): Promise<Response> {
        console.log(
            `[RegisterForCourseByCpf] courseId="${request.courseId}" cpf="${request.cpf}"`,
        );
        const parsed = schema.safeParse(request);
        if (!parsed.success) {
            return {
                error: new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid data'),
            };
        }

        const { courseId, cpf } = parsed.data;

        if (!isValidCpf(cpf)) {
            return { error: new ValidationError('CPF inválido') };
        }

        const course = await this.courseRepository.findById(courseId);
        if (!course) {
            return { error: new CourseNotFoundError() };
        }
        if (course.status === 'UNPUBLISHED') {
            return { error: new RegistrationsUnavailableError() };
        }

        const userData = await this.userDataRepository.findByCpf(cpf);
        if (!userData) {
            return { error: new UserDataNotFoundError() };
        }

        const existing = await this.registrationRepository.findByUserDataAndCourse(
            userData.id,
            courseId,
        );
        if (existing) {
            return { error: new CourseRegistrationAlreadyExistsError() };
        }

        const registration = await this.registrationRepository.create(courseId, userData.id);
        console.log(
            `[RegisterForCourseByCpf] success registrationId="${registration.id}" userDataId="${userData.id}"`,
        );
        return { registrationId: registration.id, userDataId: userData.id };
    }
}
