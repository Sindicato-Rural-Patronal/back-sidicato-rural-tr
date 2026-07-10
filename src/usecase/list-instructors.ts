import type { InstructorRepository, UserInstructorWithUser } from '../ports/external/instructor-repository.js';
import { paginate } from '../lib/pagination.js';

type ListInstructorsResponse = {
    error?: Error;
    data?: Array<{
 id: string;
bio: string | null;
userData: {
 id: string;
name: string
}
}>;
    total?: number;
    page?: number;
    limit?: number;
    totalPages?: number;
};

export class ListInstructorsUseCase {
    constructor(private readonly instructorRepository: InstructorRepository) {}

    async execute(page = 1, limit = 20): Promise<ListInstructorsResponse> {
        return paginate(
            page,
            limit,
            (skip, take) =>
                this.instructorRepository.findAll(skip, take).then(instructors =>
                    instructors.map((i: UserInstructorWithUser) => ({
                        id: i.id,
                        bio: i.bio,
                        userData: { id: i.userData.id,
name: i.userData.name },
                    })),
                ),
            () => this.instructorRepository.count(),
        );
    }
}
