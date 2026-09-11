import type {
    FinanceRepository,
    FinanceAttachmentMeta,
} from '../ports/external/finance-repository.js';
import { FinanceTransactionNotFoundError } from '../errors/not-found.js';
import { ValidationError } from '../errors/validation.js';

const MAX_BYTES = 15 * 1024 * 1024; // 15MB
const ALLOWED = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

export class UploadFinanceAttachmentUseCase {
    constructor(private readonly repo: FinanceRepository) {}

    async execute(
        transactionId: string,
        data: Buffer,
        filename: string,
        mimeType: string,
    ): Promise<{ error?: Error; attachment?: FinanceAttachmentMeta }> {
        const tx = await this.repo.findTransactionById(transactionId);
        if (!tx) return { error: new FinanceTransactionNotFoundError() };
        if (!ALLOWED.has(mimeType)) {
            return { error: new ValidationError('Formato não aceito. Envie PDF, JPG, PNG ou WEBP.') };
        }
        if (data.length === 0) return { error: new ValidationError('Arquivo vazio.') };
        if (data.length > MAX_BYTES) {
            return { error: new ValidationError('Arquivo excede o limite de 15MB.') };
        }
        const attachment = await this.repo.addAttachment(transactionId, data, filename, mimeType, data.length);
        return { attachment };
    }
}
