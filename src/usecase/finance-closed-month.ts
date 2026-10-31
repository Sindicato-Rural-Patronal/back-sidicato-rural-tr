import type {
    FinanceAccountMonth,
    FinanceRepository,
} from '../ports/external/finance-repository.js';
import { ClosedMonthError } from '../errors/business-rule.js';

// Trava do mês fechado (SR-054, decidida pelo usuário em 30/10).
//
// O fechamento é por caixa e mês (FinanceMonthlyClosing, único por accountId +
// month), então a trava também é: com o mês fechado no caixa, nenhum lançamento
// desse caixa com data naquele mês é criado, editado ou excluído, e nenhum
// lançamento é movido para dentro ou para fora dele. Lançamento sem caixa não
// entra em fechamento nenhum e não é travado. Reabrir (apagar o fechamento)
// libera tudo de novo.

/**
 * Mês "AAAA-MM" da data do lançamento. As datas chegam do painel como
 * "AAAA-MM-DD" (meia-noite UTC), o mesmo relógio de `monthRange`, que dá o
 * período do fechamento.
 */
export function monthOfDate(date: Date): string {
    return date.toISOString().slice(0, 7);
}

/** Caixa e data de um lançamento, antes ou depois da mudança. */
export type FinanceLockTarget = {
    accountId: string | null | undefined;
    date: Date;
};

/**
 * Erro do primeiro mês fechado entre os alvos (o mais antigo), ou undefined se
 * todos estão abertos. Alvo sem caixa não conta.
 */
export async function closedMonthError(
    repo: FinanceRepository,
    targets: FinanceLockTarget[],
): Promise<ClosedMonthError | undefined> {
    const pairs = new Map<string, FinanceAccountMonth>();
    for (const t of targets) {
        if (!t.accountId) continue;
        const month = monthOfDate(t.date);
        pairs.set(`${t.accountId}|${month}`, {
            accountId: t.accountId,
            month,
        });
    }
    if (pairs.size === 0) return undefined;
    const [closed] = await repo.findClosedMonths([...pairs.values()]);
    return closed ? new ClosedMonthError(closed.month, closed.accountName) : undefined;
}
