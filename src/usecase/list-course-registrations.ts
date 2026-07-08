import type {
    RegistrationRepository,
    RegistrationWithUserData,
} from '../ports/external/registration-repository.js';
import { paginate } from '../lib/pagination.js';

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
        return paginate(
            page,
            limit,
            (skip, take) => this.registrationRepository.findByCourseId(courseId, skip, take),
            () => this.registrationRepository.countByCourseId(courseId),
        );
    }
}
