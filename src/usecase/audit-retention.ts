import { z } from 'zod';
import type { SiteSettingsRepository } from '../ports/external/site-settings-repository.js';
import { ValidationError } from '../errors/validation.js';

// Tempo de guarda da trilha de auditoria. Fica em SiteSetting (chave → valor),
// como as demais configurações do painel, mas com permissão própria
// (READ_AUDIT para ver, UPDATE_AUDIT para mudar).
export const AUDIT_RETENTION_KEY = 'audit.retentionDays';

/** 0 = guardar para sempre. Opções oferecidas no painel. */
export const AUDIT_RETENTION_OPTIONS = [0, 90, 180, 365, 730] as const;

/** Fora das opções o painel não oferece, mas a API aceita qualquer valor nesta faixa. */
export const AUDIT_RETENTION_MIN_DAYS = 30;
export const AUDIT_RETENTION_MAX_DAYS = 3650;

/** Valor gravado → dias. Vazio, inválido ou negativo = 0 (guardar para sempre). */
export function parseRetentionDays(raw: string | null | undefined): number {
    const n = Number((raw ?? '').trim());
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.min(Math.floor(n), AUDIT_RETENTION_MAX_DAYS);
}

const schema = z.object({
    retentionDays: z
        .number({ message: 'Informe o tempo de guarda em dias.' })
        .int('Tempo de guarda: use um número inteiro de dias.')
        .min(0, 'Tempo de guarda: use 0 (para sempre) ou de 30 a 3650 dias.')
        .max(AUDIT_RETENTION_MAX_DAYS, `Tempo de guarda: no máximo ${AUDIT_RETENTION_MAX_DAYS} dias.`)
        .refine(
            v => v === 0 || v >= AUDIT_RETENTION_MIN_DAYS,
            `Tempo de guarda: use 0 (para sempre) ou pelo menos ${AUDIT_RETENTION_MIN_DAYS} dias.`,
        ),
});

/** Tempo de guarda atual (READ_AUDIT). */
export class GetAuditRetentionUseCase {
    constructor(private readonly repo: SiteSettingsRepository) {}

    async execute(): Promise<{ retentionDays: number }> {
        const all = await this.repo.getAll();
        return { retentionDays: parseRetentionDays(all[AUDIT_RETENTION_KEY]) };
    }
}

/** Muda o tempo de guarda (UPDATE_AUDIT). A limpeza em si roda no adapter. */
export class UpdateAuditRetentionUseCase {
    constructor(private readonly repo: SiteSettingsRepository) {}

    async execute(input: unknown): Promise<{
 error?: Error;
retentionDays?: number
}> {
        const parsed = schema.safeParse(input);
        if (!parsed.success) {
            return { error: new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos') };
        }
        const retentionDays = parsed.data.retentionDays;
        await this.repo.upsertMany({ [AUDIT_RETENTION_KEY]: String(retentionDays) });
        return { retentionDays };
    }
}
