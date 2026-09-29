import type { InstructorRepository } from '../ports/external/instructor-repository.js';
import { InstructorNotFoundError } from '../errors/not-found.js';

type DemoteInstructorResponse = { error?: Error };

export class DemoteInstructorUseCase {
    constructor(private readonly instructorRepository: InstructorRepository) {}

    async execute(userDataId: string): Promise<DemoteInstructorResponse> {
        const instructor = await this.instructorRepository.findByUserId(userDataId);
        if (!instructor) return { error: new InstructorNotFoundError() };

        // O retorno era ignorado: quando a remocao falhava, a rota respondia
        // 200 e a pessoa continuava instrutora.
        const removido = await this.instructorRepository.demote(userDataId);
        if (!removido) return { error: new InstructorNotFoundError() };
        return {};
    }
}
