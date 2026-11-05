/**
 * Nº dos lançamentos do Financeiro (decisão 005, itens 2 e 3).
 *
 * Uma sequência só, que nunca recomeça e conta também os excluídos:
 * - automático: o maior número que existe + 1 (e não o "próximo livre", que
 *   encheria os buracos dos digitados e tiraria a ordem de lançamento);
 * - digitado: aceito quando nenhum lançamento usa, nem excluído. Abaixo do
 *   próximo (um buraco), a sequência não muda; acima, ela continua dele.
 *
 * Quem chama roda isto dentro da trava (`pg_advisory_xact_lock` no adapter):
 * entre ler o maior e gravar, ninguém mais grava número.
 */

/** Quem já usa um número. */
export type FinanceNumberOwner = {
 id: string;
isDeleted: boolean 
};

/** O número pedido já é de outro lançamento (`deleted`: de um excluído). */
export type FinanceNumberConflict = {
 number: number;
deleted: boolean 
};

/** O que a regra lê do banco, dentro da transação travada. */
export interface FinanceNumberReader {
    /** O maior número gravado, contando os excluídos; null se ninguém tem. */
    maxNumber(): Promise<number | null>;
    /** Quem usa este número, excluído ou não. */
    ownerOf(number: number): Promise<FinanceNumberOwner | null>;
}

/** O próximo automático: o maior + 1. Sem nenhum número ainda, 1. */
export function nextFinanceNumber(max: number | null): number {
    return (max ?? 0) + 1;
}

/**
 * O número que o lançamento vai gravar.
 * @param typed o digitado; sem ele, o automático.
 * @param selfId na edição, o próprio lançamento: manter o número que ele já tem não é conflito.
 */
export async function pickFinanceNumber(
    reader: FinanceNumberReader,
    typed?: number,
    selfId?: string,
): Promise<{ number: number } | { conflict: FinanceNumberConflict }> {
    if (typed === undefined) return { number: nextFinanceNumber(await reader.maxNumber()) };
    const owner = await reader.ownerOf(typed);
    if (owner && owner.id !== selfId) {
        return { conflict: { number: typed,
deleted: owner.isDeleted } };
    }
    return { number: typed };
}

/** Rótulo do lançamento na auditoria: "nº 123 — descrição" (sem número, só a descrição). */
export function financeTransactionLabel(number: number | null | undefined, description: string): string {
    return number == null ? description : `nº ${number} — ${description}`;
}

/**
 * O termo da busca é um Nº? Só dígitos (aparado) e dentro do int4 do Postgres.
 * "0045" vale 45: o número é inteiro, então a comparação é de igualdade.
 */
export function financeNumberSearchTerm(term: string): number | null {
    const t = term.trim();
    if (!/^[0-9]+$/.test(t)) return null;
    const n = Number(t);
    return n >= 1 && n <= 2147483647 ? n : null;
}
