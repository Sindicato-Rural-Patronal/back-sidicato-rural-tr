import { z } from 'zod';
import { ValidationError } from '../errors/validation.js';
import type { UserDataRepository } from '../ports/external/user-data-repository.js';

const schema = z.object({ order: z.array(z.string().uuid()).min(1) });

type Response = { error?: Error };

export class ReorderPartnersUseCase {
    constructor(private readonly repo: UserDataRepository) {}

    async execute(input: unknown): Promise<Response> {
        const parsed = schema.safeParse(input);
        if (!parsed.success) {
            return { error: new ValidationError(parsed.error.issues[0].message) };
        }
        await this.repo.reorderPartners(parsed.data.order);
        return {};
    }
}
