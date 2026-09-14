import type { PrismaClient } from '@prisma/client/extension';
import type { SiteSettingsRepository } from '../../ports/external/site-settings-repository.js';

export function createSiteSettingsAdapter(prisma: PrismaClient): SiteSettingsRepository {
    return new SiteSettingsAdapter(prisma);
}

class SiteSettingsAdapter implements SiteSettingsRepository {
    constructor(private prisma: PrismaClient) {}

    async getAll(): Promise<Record<string, string>> {
        const rows = await this.prisma.siteSetting.findMany();
        return Object.fromEntries(rows.map((r: { key: string; value: string }) => [r.key, r.value]));
    }

    async upsertMany(entries: Record<string, string>): Promise<void> {
        const ops = Object.entries(entries).map(([key, value]) =>
            this.prisma.siteSetting.upsert({
                where: { key },
                create: { key, value },
                update: { value },
            }),
        );
        if (ops.length > 0) await this.prisma.$transaction(ops);
    }
}
