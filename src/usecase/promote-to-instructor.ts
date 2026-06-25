import type { InstructorRepository } from '../ports/external/instructor-repository.js';
import type { UserDataRepository } from '../ports/external/user-data-repository.js';
import { UserDataNotFoundError } from '../errors/not-found.js';
import { InstructorAlreadyExistsError } from '../errors/conflict.js';

type PromoteToInstructorRequest = {
    userDataId: string;
    bio?: string;
    linkedin?: string;
    instagram?: string;
    facebook?: string;
};
type PromoteToInstructorResponse = { error?: Error; instructorId?: string };

export class PromoteToInstructorUseCase {
    constructor(
        private readonly instructorRepository: InstructorRepository,
        private readonly userDataRepository: UserDataRepository,
    ) {}

    async execute(request: PromoteToInstructorRequest): Promise<PromoteToInstructorResponse> {
        const user = await this.userDataRepository.findById(request.userDataId);
        if (!user) return { error: new UserDataNotFoundError() };

        const existing = await this.instructorRepository.findByUserId(request.userDataId);
        if (existing) return { error: new InstructorAlreadyExistsError() };

        const instructor = await this.instructorRepository.promote(
            request.userDataId,
            request.bio,
            request.linkedin,
            request.instagram,
            request.facebook,
        );
        return { instructorId: instructor.id };
    }
}
