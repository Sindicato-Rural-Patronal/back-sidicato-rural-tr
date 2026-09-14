import type { SiteSettingsRepository } from '../ports/external/site-settings-repository.js';

export type SocialSettings = {
    facebook: string;
    instagram: string;
    whatsapp: string;
};

export const SOCIAL_KEYS = {
    facebook: 'social.facebook',
    instagram: 'social.instagram',
    whatsapp: 'social.whatsapp',
} as const;

export class GetSiteSettingsUseCase {
    constructor(private readonly repo: SiteSettingsRepository) {}

    async execute(): Promise<SocialSettings> {
        const all = await this.repo.getAll();
        return {
            facebook: all[SOCIAL_KEYS.facebook] ?? '',
            instagram: all[SOCIAL_KEYS.instagram] ?? '',
            whatsapp: all[SOCIAL_KEYS.whatsapp] ?? '',
        };
    }
}
