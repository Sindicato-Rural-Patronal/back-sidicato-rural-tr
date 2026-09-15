import type { UnimedRepository, UnimedWithUser } from '../ports/external/unimed-repository.js';
import { UnimedBeneficiarioNotFoundError } from '../errors/not-found.js';

export class GetUnimedUseCase {
    constructor(private readonly repo: UnimedRepository) {}

    async execute(id: string): Promise<{ error?: Error; beneficiario?: UnimedWithUser }> {
        const beneficiario = await this.repo.findById(id);
        if (!beneficiario) return { error: new UnimedBeneficiarioNotFoundError() };
        return { beneficiario };
    }
}
