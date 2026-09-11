import type { FinanceRepository } from '../ports/external/finance-repository.js';
import { NotFoundError } from '../errors/not-found.js';

export class DeleteFinanceAttachmentUseCase {
    constructor(private readonly repo: FinanceRepository) {}

    async execute(id: string): Promise<{ error?: Error }> {
        const ok = await this.repo.deleteAttachment(id);
        if (!ok) return { error: new NotFoundError('Comprovante não encontrado') };
        return {};
    }
}
