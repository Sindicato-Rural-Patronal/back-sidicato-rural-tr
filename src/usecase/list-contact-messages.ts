import type { ContactMessageRepository, ContactMessageModel, ContactMessageFilters } from '../ports/external/contact-message-repository.js';

type Input = {
    page?: number;
    limit?: number;
    read?: boolean;
    search?: string;
};

type Response = {
    error?: Error;
    data?: ContactMessageModel[];
    total?: number;
    page?: number;
    limit?: number;
    totalPages?: number;
};

export class ListContactMessagesUseCase {
    constructor(private readonly repo: ContactMessageRepository) {}

    async execute({ page = 1, limit = 20, read, search }: Input = {}): Promise<Response> {
        const skip = (page - 1) * limit;
        const filters: ContactMessageFilters = { read, search: search?.trim() || undefined };
        const [data, total] = await Promise.all([
            this.repo.findAll(skip, limit, filters),
            this.repo.count(filters),
        ]);
        return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
    }
}
