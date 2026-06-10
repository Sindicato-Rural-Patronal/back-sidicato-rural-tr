import type {
    RegistrationRepository,
    RegistrationWithUserData,
} from '../ports/external/registration-repository.js';

type Response = {
    error?: Error;
    registrations?: RegistrationWithUserData[];
};

export class ListCourseRegistrationsUseCase {
    constructor(private readonly registrationRepository: RegistrationRepository) {}

    async execute(courseId: string): Promise<Response> {
        console.log(`[ListCourseRegistrations] courseId="${courseId}"`);
        const registrations = await this.registrationRepository.findByCourseId(courseId);
        console.log(`[ListCourseRegistrations] returning ${registrations.length} registrations`);
        return { registrations };
    }
}
