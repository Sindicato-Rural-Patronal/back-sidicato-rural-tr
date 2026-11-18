import { z } from 'zod';
import { financeDate } from './finance-dates.js';

// Os filtros dos lançamentos, num arquivo só deles: a lista
// (`list-finance-transactions.ts`) usa a fonte da exportação para as células
// (decisão 007), e a fonte usa estes filtros. Com o schema aqui, nenhum dos
// dois importa o outro em ciclo.

/** Filtros dos lançamentos (lista e exportação usam os mesmos). */
export const financeFiltersSchema = z.object({
    from: z.preprocess(v => (v === '' || v == null ? undefined : v), financeDate.optional()),
    to: z.preprocess(v => (v === '' || v == null ? undefined : v), financeDate.optional()),
    type: z.enum(['IN', 'OUT']).optional(),
    categoryId: z.preprocess(v => (v === '' ? undefined : v), z.string().uuid().optional()),
    accountId: z.preprocess(v => (v === '' ? undefined : v), z.string().uuid().optional()),
    // Forma de pagamento (texto do lançamento) — o filtro ignora maiúsculas.
    method: z.preprocess(v => (v === '' ? undefined : v), z.string().optional()),
    search: z.preprocess(v => (v === '' ? undefined : v), z.string().optional()),
    // Ordem: data (padrão, a de sempre) ou Nº, os dois do mais novo para o mais antigo.
    orderBy: z.preprocess(v => (v === '' ? undefined : v), z.enum(['date', 'number']).optional()),
    // Sem as duas pernas das transferências entre caixas (SR-135). "true"/"false"
    // na query, boolean no corpo; outro valor é erro. `false` vale como ausente:
    // nada muda (nem o escopo "com filtros" da auditoria).
    excludeTransfers: z
        .preprocess(
            v => (v === '' || v == null ? undefined : v === 'true' ? true : v === 'false' ? false : v),
            z.boolean().optional(),
        )
        .transform(v => (v ? true : undefined)),
});

/** `to` costuma vir como data (00:00 UTC) — inclui o dia inteiro. */
export function endOfDay(d: Date | undefined): Date | undefined {
    return d ? new Date(d.getTime() + 24 * 60 * 60 * 1000 - 1) : undefined;
}
