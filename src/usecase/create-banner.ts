import { z } from 'zod';
import { ValidationError } from '../errors/validation.js';
import type { BannerRepository, BannerModel } from '../ports/external/banner-repository.js';

// O botão sai num <a href> da home (GET /banners é pública): só caminho do
// próprio site ("/cursos", "#contato") ou endereço http(s) completo.
// `javascript:`, `data:` e afins são recusados aqui; "//outro.site" também,
// porque parece caminho mas leva para fora.
const BANNER_URL_MESSAGE = 'Link do botão: use um caminho do site (/cursos) ou um endereço completo (https://...)';

function isBannerUrl(value: string): boolean {
    if (/^\/(?!\/)/.test(value) || value.startsWith('#')) return true;
    if (!/^https?:\/\//i.test(value)) return false;
    try {
        return Boolean(new URL(value).hostname);
    } catch {
        return false;
    }
}

export const bannerButtonSchema = z.object({
    label: z.string().min(1).max(40),
    url: z.string().trim().min(1).max(500).refine(isBannerUrl, BANNER_URL_MESSAGE),
    external: z.boolean().default(false),
    variant: z.enum(['primary', 'secondary']).default('primary'),
});

const schema = z
    .object({
        title: z.string().min(1).max(100),
        subtitle: z.string().max(200).optional().nullable(),
        active: z.boolean().default(true),
        order: z.number().int().min(0).optional(),
        buttons: z.array(bannerButtonSchema).max(2).default([]),
        startDate: z.coerce.date().optional().nullable(),
        endDate: z.coerce.date().optional().nullable(),
    })
    .refine(
        d => !(d.startDate && d.endDate && d.startDate >= d.endDate),
        { message: 'A data de início precisa ser antes da data de término.' },
    );

type Response = {
 error?: Error;
banner?: BannerModel 
};

export class CreateBannerUseCase {
    constructor(private readonly repo: BannerRepository) {}

    async execute(input: unknown): Promise<Response> {
        const parsed = schema.safeParse(input);
        if (!parsed.success) {
            return { error: new ValidationError(parsed.error.issues[0].message) };
        }

        const { order, ...rest } = parsed.data;
        const resolvedOrder = order !== undefined ? order : (await this.repo.findMaxOrder()) + 1;

        const banner = await this.repo.create({ ...rest,
order: resolvedOrder });
        return { banner };
    }
}
