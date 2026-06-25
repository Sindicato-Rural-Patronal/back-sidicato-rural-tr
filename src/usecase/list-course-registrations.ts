import type {
    RegistrationRepository,
    RegistrationWithUserData,
} from '../ports/external/registration-repository.js';

type Response = {
    error?: Error;
    data?: RegistrationWithUserData[];
    total?: number;
    page?: number;
    limit?: number;
    totalPages?: number;
};

export class ListCourseRegistrationsUseCase {
    constructor(private readonly registrationRepository: RegistrationRepository) {}

    async execute(courseId: string, page = 1, limit = 20): Promise<Response> {
        const skip = (page - 1) * limit;
        const [data, total] = await Promise.all([
            this.registrationRepository.findByCourseId(courseId, skip, limit),
            this.registrationRepository.countByCourseId(courseId),
        ]);
        return { data,
total,
page,
limit,
totalPages: Math.ceil(total / limit) };
    }
}
