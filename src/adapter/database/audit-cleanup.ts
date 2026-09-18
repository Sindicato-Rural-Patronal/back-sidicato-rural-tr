import type { PrismaClient } from '@prisma/client/extension';
import { AUDIT_RETENTION_KEY, parseRetentionDays } from '../../usecase/audit-retention.js';

// Limpeza da trilha de auditoria conforme o tempo de guarda configurado no
// painel. Mesma ideia da limpeza dos eventos do sino (notification-adapter):
// roda a reboque de uma gravação, no máximo uma vez por hora por processo, e
// nunca derruba a ação que a disparou.

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Linhas apagadas por comando e por rodada — não segura o banco numa varrida só. */
const BATCH_SIZE = 1000;
const MAX_BATCHES = 20;

// Compartilhado entre chamadas (o hook é registrado uma vez por app).
let lastCleanupAt = 0;

/** Só para os testes: zera o relógio da última limpeza. */
export function resetAuditCleanupClock(at = 0): void {
    lastCleanupAt = at;
}

/** Já passou a janela? Marca a rodada como feita. */
export function dueForAuditCleanup(now = Date.now()): boolean {
    if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return false;
    lastCleanupAt = now;
    return true;
}

/**
 * Apaga registros mais velhos que o tempo de guarda. Guarda 0/ausente = para
 * sempre: não apaga nada. Devolve quantas linhas saíram.
 */
export async function purgeOldAuditLogs(
    prisma: PrismaClient,
    retentionDays: number,
    now = Date.now(),
): Promise<number> {
    if (!retentionDays || retentionDays <= 0) return 0;
    const cutoff = new Date(now - retentionDays * DAY_MS);
    let deleted = 0;
    for (let i = 0; i < MAX_BATCHES; i++) {
        const removed: number = await prisma.$executeRaw`
            DELETE FROM "AuditLog"
            WHERE "id" IN (
                SELECT "id" FROM "AuditLog" WHERE "createdAt" < ${cutoff} LIMIT ${BATCH_SIZE}
            )`;
        deleted += removed;
        if (removed < BATCH_SIZE) break;
    }
    return deleted;
}

/** Lê o tempo de guarda gravado (0 = para sempre). */
export async function readAuditRetentionDays(prisma: PrismaClient): Promise<number> {
    const row: {value: string} | null = await prisma.siteSetting.findUnique({
        where: { key: AUDIT_RETENTION_KEY },
        select: { value: true },
    });
    return parseRetentionDays(row?.value);
}

/**
 * Chamada depois de gravar na trilha: no máximo uma vez por hora, apaga o que
 * passou do tempo de guarda. Erros ficam no log — auditoria nunca derruba nada.
 */
export async function maybeCleanupAuditLogs(prisma: PrismaClient, now = Date.now()): Promise<void> {
    if (!dueForAuditCleanup(now)) return;
    try {
        const retentionDays = await readAuditRetentionDays(prisma);
        if (retentionDays <= 0) return;
        const deleted = await purgeOldAuditLogs(prisma, retentionDays, now);
        if (deleted > 0) {
            console.info(
                `[auditoria] ${deleted} registro(s) com mais de ${retentionDays} dias apagado(s).`,
            );
        }
    } catch (e) {
        console.error('[auditoria] falha ao apagar registros antigos', e);
    }
}
