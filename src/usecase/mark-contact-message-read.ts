import { ContactMessageNotFoundError } from '../errors/not-found.js';
import type { ContactMessageRepository } from '../ports/external/contact-message-repository.js';

type Response = { error?: Error };

export class MarkContactMessageReadUseCase {
    constructor(private readonly repo: ContactMessageRepository) {}

    async execute(id: string): Promise<Response> {
        const existing = await this.repo.findById(id);
        if (!existing) return { error: new ContactMessageNotFoundError() };

        await this.repo.markAsRead(id);
        return {};
    }
}
