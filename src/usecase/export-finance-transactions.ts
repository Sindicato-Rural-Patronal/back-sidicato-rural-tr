import type { FinanceRepository } from '../ports/external/finance-repository.js';
import { csvDate, csvMoney, toCsv, type CsvColumn } from '../lib/csv.js';
import { endOfDay, financeFiltersSchema } from './list-finance-transactions.js';

type Row = Awaited<ReturnType<FinanceRepository['listTransactionsForExport']>>[number];

const columns: CsvColumn<Row>[] = [
    { header: 'Data',
value: t => csvDate(t.date) },
    { header: 'Tipo',
value: t => (t.type === 'IN' ? 'Entrada' : t.type === 'OUT' ? 'Saída' : 'Nota') },
    { header: 'Caixa',
value: t => t.account?.name },
    { header: 'Categoria',
value: t => t.category?.name },
    { header: 'Descrição',
value: t => t.description },
    { header: 'Método',
value: t => t.method },
    { header: 'Valor (R$)',
value: t => csvMoney(t.amountCents / 100) },
    { header: 'Observações',
value: t => t.notes },
];

// CSV dos lançamentos com os mesmos filtros da lista (planilha para o Excel).
export class ExportFinanceTransactionsUseCase {
    constructor(private readonly repo: FinanceRepository) {}

    async execute(query: unknown): Promise<string> {
        const q = financeFiltersSchema.parse(query ?? {});
        const rows = await this.repo.listTransactionsForExport({
            from: q.from,
            to: endOfDay(q.to),
            type: q.type,
            categoryId: q.categoryId,
            accountId: q.accountId,
            search: q.search,
        });
        return toCsv(columns, rows);
    }
}
