import type { UnimedRepository } from '../ports/external/unimed-repository.js';
import { UnimedBeneficiarioNotFoundError } from '../errors/not-found.js';

export class DeleteUnimedUseCase {
    constructor(private readonly repo: UnimedRepository) {}

    async execute(id: string): Promise<{ error?: Error }> {
        const ok = await this.repo.softDelete(id);
        if (!ok) return { error: new UnimedBeneficiarioNotFoundError() };
        return {};
    }
}
