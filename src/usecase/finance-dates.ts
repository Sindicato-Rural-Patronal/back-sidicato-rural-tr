import { z } from 'zod';

// Datas e meses do Financeiro (SR-055).
//
// `z.coerce.date()` aceita qualquer data que o JavaScript entende, e o Postgres
// recusa ano 0 e antes de 4713 a.C.: a data passava pelo Zod e o banco dava 500.
// E "0026-01" no mês de início de uma recorrência fazia a geração falhar toda
// vez que a tela abria. Ano fora de 1900 a 2999 é erro de digitação.

export const FINANCE_MIN_YEAR = 1900;
export const FINANCE_MAX_YEAR = 2999;

export const FINANCE_DATE_MESSAGE = `Data inválida: use um ano entre ${FINANCE_MIN_YEAR} e ${FINANCE_MAX_YEAR}.`;

export function isFinanceYear(year: number): boolean {
    return Number.isInteger(year) && year >= FINANCE_MIN_YEAR && year <= FINANCE_MAX_YEAR;
}

/**
 * Data de lançamento, transferência e filtro ("AAAA-MM-DD" ou ISO). Texto que
 * não é data e ano fora do intervalo → "Data inválida…". Campo ausente segue a
 * mensagem padrão ("Informe o campo date.", `lib/zod-config.ts`).
 */
export const financeDate = z.coerce
    .date({ error: issue => (issue.input === undefined ? undefined : FINANCE_DATE_MESSAGE) })
    .refine(d => isFinanceYear(d.getUTCFullYear()), FINANCE_DATE_MESSAGE);
