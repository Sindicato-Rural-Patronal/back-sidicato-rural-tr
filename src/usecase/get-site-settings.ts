import type { SiteSettingsRepository } from '../ports/external/site-settings-repository.js';

// Configurações do site público guardadas em SiteSetting (chave → valor).
export const SETTING_KEYS = {
    facebook: 'social.facebook',
    instagram: 'social.instagram',
    whatsapp: 'social.whatsapp',
    // Dados do sindicato (rodapé, página Contato, convênios).
    orgPhone: 'org.phone',
    orgEmail: 'org.email',
    orgStreet: 'org.street',
    orgDistrict: 'org.district',
    orgCity: 'org.city',
    orgState: 'org.state',
    orgZip: 'org.zip',
    orgHours: 'org.hours',
    orgMapQuery: 'org.mapQuery',
    // Texto da página Sobre.
    aboutText: 'about.text',
    // Fonte exibida na faixa de cotações.
    quotesSource: 'quotes.source',
} as const;

export type SiteSettings = Record<keyof typeof SETTING_KEYS, string>;

export class GetSiteSettingsUseCase {
    constructor(private readonly repo: SiteSettingsRepository) {}

    async execute(): Promise<SiteSettings> {
        const all = await this.repo.getAll();
        return Object.fromEntries(
            Object.entries(SETTING_KEYS).map(([field, key]) => [field, all[key] ?? '']),
        ) as SiteSettings;
    }
}
