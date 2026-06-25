import type { InstructorRepository } from '../ports/external/instructor-repository.js';
import { InstructorNotFoundError } from '../errors/not-found.js';

type DemoteInstructorResponse = { error?: Error };

export class DemoteInstructorUseCase {
    constructor(private readonly instructorRepository: InstructorRepository) {}

    async execute(userDataId: string): Promise<DemoteInstructorResponse> {
        const instructor = await this.instructorRepository.findByUserId(userDataId);
        if (!instructor) return { error: new InstructorNotFoundError() };

        await this.instructorRepository.demote(userDataId);
        return {};
    }
}
