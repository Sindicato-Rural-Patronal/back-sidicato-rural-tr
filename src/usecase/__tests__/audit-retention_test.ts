import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    AUDIT_RETENTION_KEY,
    GetAuditRetentionUseCase,
    UpdateAuditRetentionUseCase,
    parseRetentionDays,
} from '../audit-retention.js';
import type { SiteSettingsRepository } from '../../ports/external/site-settings-repository.js';
import {
    dueForAuditCleanup,
    purgeOldAuditLogs,
    resetAuditCleanupClock,
} from '../../adapter/database/audit-cleanup.js';

const repo = {
    getAll: vi.fn(),
    upsertMany: vi.fn(),
} as unknown as SiteSettingsRepository;

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(repo.getAll).mockResolvedValue({});
});

describe('parseRetentionDays', () => {
    it('vazio, ausente ou inválido = 0 (guardar para sempre)', () => {
        expect(parseRetentionDays(undefined)).toBe(0);
        expect(parseRetentionDays(null)).toBe(0);
        expect(parseRetentionDays('')).toBe(0);
        expect(parseRetentionDays('abc')).toBe(0);
        expect(parseRetentionDays('-90')).toBe(0);
    });

    it('lê o número de dias e limita ao máximo', () => {
        expect(parseRetentionDays('90')).toBe(90);
        expect(parseRetentionDays(' 365 ')).toBe(365);
        expect(parseRetentionDays('99999')).toBe(3650);
    });
});

describe('GetAuditRetentionUseCase', () => {
    it('sem a chave gravada devolve 0', async () => {
        const result = await new GetAuditRetentionUseCase(repo).execute();
        expect(result.retentionDays).toBe(0);
    });

    it('devolve o valor gravado', async () => {
        vi.mocked(repo.getAll).mockResolvedValue({ [AUDIT_RETENTION_KEY]: '180' });
        expect((await new GetAuditRetentionUseCase(repo).execute()).retentionDays).toBe(180);
    });
});

describe('UpdateAuditRetentionUseCase', () => {
    it('grava um valor válido', async () => {
        const result = await new UpdateAuditRetentionUseCase(repo).execute({ retentionDays: 365 });
        expect(result.error).toBeUndefined();
        expect(result.retentionDays).toBe(365);
        expect(repo.upsertMany).toHaveBeenCalledWith({ [AUDIT_RETENTION_KEY]: '365' });
    });

    it('aceita 0 (guardar para sempre)', async () => {
        const result = await new UpdateAuditRetentionUseCase(repo).execute({ retentionDays: 0 });
        expect(result.error).toBeUndefined();
        expect(repo.upsertMany).toHaveBeenCalledWith({ [AUDIT_RETENTION_KEY]: '0' });
    });

    it('recusa valores entre 1 e 29 dias', async () => {
        const result = await new UpdateAuditRetentionUseCase(repo).execute({ retentionDays: 7 });
        expect(result.error).toBeDefined();
        expect(repo.upsertMany).not.toHaveBeenCalled();
    });

    it('recusa acima do máximo e valores não inteiros', async () => {
        expect((await new UpdateAuditRetentionUseCase(repo).execute({ retentionDays: 5000 })).error).toBeDefined();
        expect((await new UpdateAuditRetentionUseCase(repo).execute({ retentionDays: 90.5 })).error).toBeDefined();
        expect((await new UpdateAuditRetentionUseCase(repo).execute({})).error).toBeDefined();
    });
});

// Prisma falso: conta as chamadas de DELETE e devolve quantas linhas "saíram".
function fakePrisma(removedPerBatch: number[]) {
    const calls: number[] = [];
    let i = 0;
    return {
        calls,
        $executeRaw: vi.fn(async () => {
            const n = removedPerBatch[i] ?? 0;
            i++;
            calls.push(n);
            return n;
        }),
    };
}

describe('purgeOldAuditLogs', () => {
    it('não apaga nada quando a guarda é 0 (para sempre)', async () => {
        const prisma = fakePrisma([1000]);
        expect(await purgeOldAuditLogs(prisma as never, 0)).toBe(0);
        expect(prisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('apaga em lotes até sobrar menos que um lote cheio', async () => {
        const prisma = fakePrisma([1000, 1000, 13]);
        expect(await purgeOldAuditLogs(prisma as never, 90)).toBe(2013);
        expect(prisma.$executeRaw).toHaveBeenCalledTimes(3);
    });

    it('para depois do limite de lotes por rodada', async () => {
        const prisma = fakePrisma(Array.from({ length: 50 }, () => 1000));
        expect(await purgeOldAuditLogs(prisma as never, 90)).toBe(20000);
        expect(prisma.$executeRaw).toHaveBeenCalledTimes(20);
    });
});

describe('dueForAuditCleanup', () => {
    it('roda no máximo uma vez por hora', () => {
        resetAuditCleanupClock();
        const t0 = 1_000_000_000;
        expect(dueForAuditCleanup(t0)).toBe(true);
        expect(dueForAuditCleanup(t0 + 60_000)).toBe(false);
        expect(dueForAuditCleanup(t0 + 60 * 60 * 1000)).toBe(true);
    });
});
