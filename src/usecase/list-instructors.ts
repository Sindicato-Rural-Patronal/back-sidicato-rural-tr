import type { InstructorRepository, UserInstructorWithUser } from '../ports/external/instructor-repository.js';

type ListInstructorsResponse = {
    error?: Error;
    data?: Array<{ id: string; bio: string | null; userData: { id: string; name: string } }>;
    total?: number;
    page?: number;
    limit?: number;
    totalPages?: number;
};

export class ListInstructorsUseCase {
    constructor(private readonly instructorRepository: InstructorRepository) {}

    async execute(page = 1, limit = 20): Promise<ListInstructorsResponse> {
        const skip = (page - 1) * limit;
        const [instructors, total] = await Promise.all([
            this.instructorRepository.findAll(skip, limit),
            this.instructorRepository.count(),
        ]);
        return {
            data: instructors.map((i: UserInstructorWithUser) => ({
                id: i.id,
                bio: i.bio,
                userData: { id: i.userData.id, name: i.userData.name },
            })),
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }
}
