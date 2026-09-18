import { z } from 'zod';
import type { UnimedRepository, UnimedWithUser } from '../ports/external/unimed-repository.js';

const querySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(1000).default(20),
    search: z.preprocess(v => (v === '' ? undefined : v), z.string().optional()),
    // Aba Unimed da ficha da pessoa: cadastros dela ou em que ela é o titular.
    userDataId: z.preprocess(v => (v === '' ? undefined : v), z.string().uuid().optional()),
});

export type UnimedPage = {
    data: UnimedWithUser[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
};

export class ListUnimedUseCase {
    constructor(private readonly repo: UnimedRepository) {}

    async execute(query: unknown): Promise<UnimedPage> {
        const q = querySchema.parse(query ?? {});
        const { items, total } = await this.repo.list({
            page: q.page,
            limit: q.limit,
            search: q.search,
            userDataId: q.userDataId,
        });
        return {
            data: items,
            total,
            page: q.page,
            limit: q.limit,
            totalPages: Math.max(1, Math.ceil(total / q.limit)),
        };
    }
}
