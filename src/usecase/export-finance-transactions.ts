import { z } from 'zod';
import type { FinanceRepository } from '../ports/external/finance-repository.js';

const querySchema = z.object({
    from: z.preprocess(v => (v === '' || v == null ? undefined : v), z.coerce.date().optional()),
    to: z.preprocess(v => (v === '' || v == null ? undefined : v), z.coerce.date().optional()),
    type: z.enum(['IN', 'OUT']).optional(),
    categoryId: z.preprocess(v => (v === '' ? undefined : v), z.string().uuid().optional()),
    accountId: z.preprocess(v => (v === '' ? undefined : v), z.string().uuid().optional()),
    search: z.preprocess(v => (v === '' ? undefined : v), z.string().optional()),
});

// Campo CSV seguro: aspas quando tiver ; " ou quebra de linha.
function cell(v: string): string {
    return /[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function brl(cents: number): string {
    return (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2,
maximumFractionDigits: 2 });
}

function ddmmyyyy(d: Date): string {
    return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
}

export class ExportFinanceTransactionsUseCase {
    constructor(private readonly repo: FinanceRepository) {}

    async execute(query: unknown): Promise<string> {
        const q = querySchema.parse(query ?? {});
        const to = q.to ? new Date(q.to.getTime() + 24 * 60 * 60 * 1000 - 1) : undefined;

        const rows = await this.repo.listTransactionsForExport({
            from: q.from,
            to,
            type: q.type,
            categoryId: q.categoryId,
            accountId: q.accountId,
            search: q.search,
        });

        const header = ['Data', 'Tipo', 'Caixa', 'Categoria', 'Descrição', 'Método', 'Valor (R$)', 'Observações'];
        const lines = [header.join(';')];
        for (const t of rows) {
            lines.push([
                ddmmyyyy(t.date),
                t.type === 'IN' ? 'Entrada' : t.type === 'OUT' ? 'Saída' : 'Nota',
                cell(t.account?.name ?? ''),
                cell(t.category?.name ?? ''),
                cell(t.description),
                cell(t.method ?? ''),
                brl(t.amountCents),
                cell(t.notes ?? ''),
            ].join(';'));
        }
        return lines.join('\r\n');
    }
}
