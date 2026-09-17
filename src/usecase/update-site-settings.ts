import { z } from 'zod';
import type { SiteSettingsRepository } from '../ports/external/site-settings-repository.js';
import { ValidationError } from '../errors/validation.js';
import { SETTING_KEYS } from './get-site-settings.js';

// URL http(s) ou vazio (vazio limpa o link). Casa com o safeUrl do frontend,
// que bloqueia qualquer coisa que não seja http/https.
const httpOrEmpty = (v: string | undefined) => {
    const s = (v ?? '').trim();
    return s === '' || /^https?:\/\//i.test(s);
};

const text = (max: number, label: string) => z.string().trim().max(max, `${label}: máximo de ${max} caracteres`).optional();

const schema = z.object({
    facebook: z.string().trim().max(500).optional().refine(httpOrEmpty, 'URL do Facebook inválida (use http/https).'),
    instagram: z.string().trim().max(500).optional().refine(httpOrEmpty, 'URL do Instagram inválida (use http/https).'),
    whatsapp: z.string().trim().max(500).optional().refine(httpOrEmpty, 'Link do WhatsApp inválido (use http/https, ex: https://wa.me/55...).'),
    orgPhone: text(30, 'Telefone'),
    orgEmail: z
        .string()
        .trim()
        .max(160)
        .optional()
        .refine(v => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'E-mail inválido.'),
    orgStreet: text(160, 'Endereço'),
    orgDistrict: text(120, 'Bairro'),
    orgCity: text(120, 'Cidade'),
    orgState: z
        .string()
        .trim()
        .toUpperCase()
        .optional()
        .refine(v => !v || /^[A-Z]{2}$/.test(v), 'UF: use a sigla do estado, ex.: PR.'),
    orgZip: text(9, 'CEP'),
    orgHours: text(500, 'Horário de atendimento'),
    orgMapQuery: text(200, 'Busca do mapa'),
    aboutText: text(5000, 'Texto do Sobre'),
});

// Configurações do site público (Configurações do site no painel). A fonte das
// cotações tem endpoint próprio, com a permissão das cotações.
export class UpdateSiteSettingsUseCase {
    constructor(private readonly repo: SiteSettingsRepository) {}

    async execute(input: unknown): Promise<{ error?: Error }> {
        const parsed = schema.safeParse(input);
        if (!parsed.success) {
            return { error: new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos') };
        }
        const entries: Record<string, string> = {};
        for (const [field, value] of Object.entries(parsed.data)) {
            if (value !== undefined) entries[SETTING_KEYS[field as keyof typeof SETTING_KEYS]] = value;
        }
        await this.repo.upsertMany(entries);
        return {};
    }
}

const sourceSchema = z.object({
    source: z.string().trim().max(80, 'Fonte: máximo de 80 caracteres'),
});

export class UpdateQuotesSourceUseCase {
    constructor(private readonly repo: SiteSettingsRepository) {}

    async execute(input: unknown): Promise<{ error?: Error }> {
        const parsed = sourceSchema.safeParse(input);
        if (!parsed.success) {
            return { error: new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos') };
        }
        await this.repo.upsertMany({ [SETTING_KEYS.quotesSource]: parsed.data.source });
        return {};
    }
}
