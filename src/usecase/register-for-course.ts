import { z } from 'zod/v4';
import type { CourseRepository } from '../ports/external/course-repository.js';
import type { UserDataRepository } from '../ports/external/user-data-repository.js';
import type { RegistrationRepository } from '../ports/external/registration-repository.js';
import { ValidationError } from '../errors/validation.js';
import { CourseNotFoundError } from '../errors/not-found.js';
import { CourseRegistrationAlreadyExistsError } from '../errors/conflict.js';
import { RegistrationsUnavailableError } from '../errors/business-rule.js';

const schema = z.object({
    courseId: z.string().min(1),
    name: z.string().min(1),
    phone: z.string().min(1),
    email: z.email(),
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
        console.log(
            `[RegisterForCourse] courseId="${request.courseId}" email="${request.email}" cpf="${request.cpf}"`,
        );
        const parsed = schema.safeParse(request);
        if (!parsed.success) {
            console.log(
                `[RegisterForCourse] validation failed: ${parsed.error.issues[0]?.message}`,
            );
            return {
                error: new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid data'),
            };
        }

        const { courseId, name, phone, email, cpf } = parsed.data;

        const course = await this.courseRepository.findById(courseId);
        if (!course) {
            return { error: new CourseNotFoundError() };
        }
        if (course.status === 'UNPUBLISHED') {
            return { error: new RegistrationsUnavailableError() };
        }

        let userData = await this.userDataRepository.findByEmailOrCpf(email, cpf);

        if (!userData) {
            userData = await this.userDataRepository.create({
                name,
                phone,
                email,
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

        const registration = await this.registrationRepository.create(courseId, userData.id);
        console.log(
            `[RegisterForCourse] success registrationId="${registration.id}" userDataId="${userData.id}"`,
        );
        return { registrationId: registration.id,
userDataId: userData.id };
    }
}
