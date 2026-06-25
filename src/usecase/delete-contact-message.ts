import { ContactMessageNotFoundError } from '../errors/not-found.js';
import type { ContactMessageRepository } from '../ports/external/contact-message-repository.js';

type Response = { error?: Error };

export class DeleteContactMessageUseCase {
    constructor(private readonly repo: ContactMessageRepository) {}

    async execute(id: string): Promise<Response> {
        const message = await this.repo.findById(id);
        if (!message) return { error: new ContactMessageNotFoundError() };
        await this.repo.delete(id);
        return {};
    }
}
