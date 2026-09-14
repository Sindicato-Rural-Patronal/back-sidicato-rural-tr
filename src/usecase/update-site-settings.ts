import { z } from 'zod';
import type { SiteSettingsRepository } from '../ports/external/site-settings-repository.js';
import { ValidationError } from '../errors/validation.js';
import { SOCIAL_KEYS } from './get-site-settings.js';

// URL http(s) ou vazio (vazio limpa o link). Casa com o safeUrl do frontend,
// que bloqueia qualquer coisa que não seja http/https.
const httpOrEmpty = (v: string | undefined) => {
    const s = (v ?? '').trim();
    return s === '' || /^https?:\/\//i.test(s);
};

const schema = z.object({
    facebook: z.string().trim().max(500).optional().refine(httpOrEmpty, 'URL do Facebook inválida (use http/https).'),
    instagram: z.string().trim().max(500).optional().refine(httpOrEmpty, 'URL do Instagram inválida (use http/https).'),
    whatsapp: z.string().trim().max(500).optional().refine(httpOrEmpty, 'Link do WhatsApp inválido (use http/https, ex: https://wa.me/55...).'),
});

export class UpdateSiteSettingsUseCase {
    constructor(private readonly repo: SiteSettingsRepository) {}

    async execute(input: unknown): Promise<{ error?: Error }> {
        const parsed = schema.safeParse(input);
        if (!parsed.success) {
            return { error: new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos') };
        }
        const d = parsed.data;
        const entries: Record<string, string> = {};
        if (d.facebook !== undefined) entries[SOCIAL_KEYS.facebook] = d.facebook.trim();
        if (d.instagram !== undefined) entries[SOCIAL_KEYS.instagram] = d.instagram.trim();
        if (d.whatsapp !== undefined) entries[SOCIAL_KEYS.whatsapp] = d.whatsapp.trim();
        await this.repo.upsertMany(entries);
        return {};
    }
}
