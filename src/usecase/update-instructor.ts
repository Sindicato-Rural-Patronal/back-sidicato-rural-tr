import type { InstructorRepository } from '../ports/external/instructor-repository.js';
import { InstructorNotFoundError } from '../errors/not-found.js';

type UpdateInstructorRequest = {
    userDataId: string;
    bio?: string | null;
    linkedin?: string | null;
    instagram?: string | null;
    facebook?: string | null;
};
type UpdateInstructorResponse = { error?: Error };

export class UpdateInstructorUseCase {
    constructor(private readonly instructorRepository: InstructorRepository) {}

    async execute(request: UpdateInstructorRequest): Promise<UpdateInstructorResponse> {
        const { userDataId, ...data } = request;
        const existing = await this.instructorRepository.findByUserId(userDataId);
        if (!existing) return { error: new InstructorNotFoundError() };

        await this.instructorRepository.update(userDataId, data);
        return {};
    }
}
