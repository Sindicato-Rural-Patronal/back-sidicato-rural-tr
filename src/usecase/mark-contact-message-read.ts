import { ContactMessageNotFoundError } from '../errors/not-found.js';
import type { ContactMessageRepository } from '../ports/external/contact-message-repository.js';

type Response = { error?: Error };

// Marca a mensagem como lida (padrão) ou como não lida. No painel, "não lida" usa a
// rota própria PATCH /admin/contacts/messages/:id/unread para a auditoria dizer qual foi.
export class MarkContactMessageReadUseCase {
    constructor(private readonly repo: ContactMessageRepository) {}

    async execute(id: string, read = true): Promise<Response> {
        const existing = await this.repo.findById(id);
        if (!existing) return { error: new ContactMessageNotFoundError() };

        if (existing.read !== read) await this.repo.setRead(id, read);
        return {};
    }
}
