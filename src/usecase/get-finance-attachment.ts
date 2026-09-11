import type {
    FinanceRepository,
    FinanceAttachmentFile,
} from '../ports/external/finance-repository.js';

export class GetFinanceAttachmentUseCase {
    constructor(private readonly repo: FinanceRepository) {}

    execute(id: string): Promise<FinanceAttachmentFile | null> {
        return this.repo.getAttachment(id);
    }
}
