import { z } from 'zod';
import { ValidationError } from '../errors/validation.js';
import type { BannerRepository } from '../ports/external/banner-repository.js';

const schema = z.object({
    order: z.array(z.string().uuid()).min(1),
});

type Request = z.infer<typeof schema>;
type Response = { error?: Error };

export class ReorderBannersUseCase {
    constructor(private readonly repo: BannerRepository) {}

    async execute(input: Request): Promise<Response> {
        const parsed = schema.safeParse(input);
        if (!parsed.success) {
            return { error: new ValidationError(parsed.error.issues[0].message) };
        }
        await this.repo.reorder(parsed.data.order);
        return {};
    }
}
