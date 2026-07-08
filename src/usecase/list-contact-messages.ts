import type { ContactMessageRepository, ContactMessageModel, ContactMessageFilters } from '../ports/external/contact-message-repository.js';
import { paginate } from '../lib/pagination.js';

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
        const filters: ContactMessageFilters = { read,
search: search?.trim() || undefined };
        return paginate(
            page,
            limit,
            (skip, take) => this.repo.findAll(skip, take, filters),
            () => this.repo.count(filters),
        );
    }
}
