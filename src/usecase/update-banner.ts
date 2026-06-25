import { z } from 'zod';
import { ValidationError } from '../errors/validation.js';
import { BannerNotFoundError } from '../errors/not-found.js';
import type { BannerRepository, BannerModel } from '../ports/external/banner-repository.js';

const buttonSchema = z.object({
    label: z.string().min(1).max(40),
    url: z.string().min(1).max(500),
    external: z.boolean().default(false),
    variant: z.enum(['primary', 'secondary']).default('primary'),
});

const schema = z
    .object({
        title: z.string().min(1).max(100).optional(),
        subtitle: z.string().max(200).optional().nullable(),
        active: z.boolean().optional(),
        order: z.number().int().min(0).optional(),
        buttons: z.array(buttonSchema).max(2).optional(),
        startDate: z.coerce.date().optional().nullable(),
        endDate: z.coerce.date().optional().nullable(),
    })
    .refine(
        d => !(d.startDate && d.endDate && d.startDate >= d.endDate),
        { message: 'startDate must be before endDate' },
    );

type Response = { error?: Error; banner?: BannerModel };

export class UpdateBannerUseCase {
    constructor(private readonly repo: BannerRepository) {}

    async execute(id: string, input: unknown): Promise<Response> {
        const existing = await this.repo.findById(id);
        if (!existing) return { error: new BannerNotFoundError() };

        const parsed = schema.safeParse(input);
        if (!parsed.success) {
            return { error: new ValidationError(parsed.error.issues[0].message) };
        }

        const banner = await this.repo.update(id, parsed.data);
        return { banner: banner! };
    }
}
