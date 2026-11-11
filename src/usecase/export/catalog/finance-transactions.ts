import type { FinanceTransactionExportRow, ExportRepository } from '../../../ports/external/export-repository.js';
import { endOfDay, financeFiltersSchema } from '../../list-finance-transactions.js';
import { describePeriod } from '../filters.js';
import { ymd } from '../format.js';
import { reportFields } from './person-fields.js';
import type { ExportField, ExportFilterDescription, ExportSource } from './types.js';

// Fonte `finance-transactions`: os lançamentos do Financeiro (permissão
// READ_FINANCE), com os mesmos filtros, busca e ordem (`orderBy`) da lista e
// de `GET /admin/finance/transactions/export`. O padrão são as 13 colunas
// daquela planilha, byte a byte (teste de ouro). Passando pelo motor, a
// exportação do Financeiro fica na auditoria, como as outras.
//
// Pessoal é o que identifica o favorecido da Nota de Empenho quando ele é
// pessoa física: o CNPJ/CPF, a inscrição estadual, o contato, o endereço e os
// dados do banco (decisão 006, item 2). O nome fica `comum`, como o da pessoa.
//
// AS CHAVES SÃO CONTRATO: não se renomeia nem se reaproveita uma chave.

// Os filtros da lista, com as mesmas mensagens. A lista não tem seleção.
const filters = financeFiltersSchema;

type FinanceFilters = ReturnType<typeof financeFiltersSchema.parse> & { ids?: never };

const filterLabels = {
    from: 'De',
    to: 'Até',
    type: 'Tipo',
    categoryId: 'Categoria',
    accountId: 'Caixa',
    // O nome do filtro na tela ("Forma") e do campo no formulário; a coluna
    // continua "Método" (teste de ouro).
    method: 'Forma de pagamento',
    search: 'Busca',
    orderBy: 'Ordem',
};

const TYPE_LABEL = { IN: 'Entrada',
OUT: 'Saída' } as const;

/** Campo de texto do empenho (JSON livre): vazio se faltar ou não for texto. */
export function empenhoField(empenho: unknown, key: string): string {
    const v = (empenho as Record<string, unknown> | null | undefined)?.[key];
    return typeof v === 'string' ? v.trim() : '';
}

/** Quem está ligado ao lançamento: a razão social e, sem ela, o nome fantasia. */
export function empenhoName(empenho: unknown): string {
    return empenhoField(empenho, 'razaoSocial') || empenhoField(empenho, 'nomeFantasia');
}

type Row = FinanceTransactionExportRow;

/** Um campo de texto da Nota de Empenho. */
const empenhoText = (
    key: string,
    label: string,
    group: string,
    from: string,
    extra: Partial<ExportField<Row>> = {},
): ExportField<Row> => ({
    key,
    label,
    group,
    type: 'text',
    privacy: 'comum',
    value: t => empenhoField(t.empenho, from),
    ...extra,
});

const financeFields: ExportField<Row>[] = [
    // Lançamento
    { key: 'number',
label: 'Nº',
group: 'Lançamento',
type: 'number',
privacy: 'comum',
value: t => t.number },
    { key: 'date',
label: 'Data',
group: 'Lançamento',
type: 'date',
privacy: 'comum',
value: t => t.date },
    {
        key: 'type',
        label: 'Tipo',
        group: 'Lançamento',
        type: 'text',
        privacy: 'comum',
        weight: 1.5,
        value: t => (t.type ? TYPE_LABEL[t.type] : 'Nota'),
    },
    { key: 'account',
label: 'Caixa',
group: 'Lançamento',
type: 'text',
privacy: 'comum',
value: t => t.account?.name },
    { key: 'category',
label: 'Categoria',
group: 'Lançamento',
type: 'text',
privacy: 'comum',
value: t => t.category?.name },
    { key: 'description',
label: 'Descrição',
group: 'Lançamento',
type: 'text',
privacy: 'comum',
weight: 4,
value: t => t.description },
    { key: 'method',
label: 'Método',
group: 'Lançamento',
type: 'text',
privacy: 'comum',
value: t => t.method },
    { key: 'recurring',
label: 'Recorrente',
group: 'Lançamento',
type: 'boolean',
privacy: 'comum',
weight: 1.25,
value: t => !!t.recurringId },
    { key: 'transfer',
label: 'Transferência',
group: 'Lançamento',
type: 'boolean',
privacy: 'comum',
weight: 1.25,
value: t => !!t.transferId },
    { key: 'notes',
label: 'Observações',
group: 'Lançamento',
type: 'text',
privacy: 'comum',
weight: 4,
value: t => t.notes },

    // Valores
    { key: 'amount',
label: 'Valor (R$)',
group: 'Valores',
type: 'money',
privacy: 'comum',
value: t => t.amountCents / 100 },
    {
        key: 'discount',
        label: 'Desconto (R$)',
        group: 'Valores',
        type: 'money',
        privacy: 'comum',
        value: t => {
            const cents = (t.empenho as Record<string, unknown> | null)?.descontoCents;
            return typeof cents === 'number' && Number.isFinite(cents) ? cents / 100 : null;
        },
    },

    // Favorecido (Nota de Empenho)
    { key: 'payeeName',
label: 'Nome / Razão social',
group: 'Favorecido',
type: 'text',
privacy: 'comum',
weight: 3,
value: t => empenhoName(t.empenho) },
    // Como foi digitado na nota (com ou sem pontuação), como sempre saiu.
    empenhoText('payeeDocument', 'CNPJ / CPF', 'Favorecido', 'cnpjCpf', { privacy: 'pessoal' }),
    empenhoText('payeeCompanyName', 'Razão social', 'Favorecido', 'razaoSocial', { weight: 3 }),
    empenhoText('payeeTradeName', 'Nome fantasia', 'Favorecido', 'nomeFantasia', { weight: 3 }),
    empenhoText('payeeStateRegistration', 'Inscrição estadual', 'Favorecido', 'inscricaoEstadual', { privacy: 'pessoal' }),
    empenhoText('payeePhone', 'Telefone', 'Favorecido', 'telefone', { type: 'phone',
privacy: 'pessoal' }),
    empenhoText('payeeAddress', 'Endereço', 'Favorecido', 'endereco', { privacy: 'pessoal',
weight: 3 }),
    empenhoText('payeeNeighborhood', 'Bairro', 'Favorecido', 'bairro', { privacy: 'pessoal' }),
    empenhoText('payeeCity', 'Cidade', 'Favorecido', 'cidade', { privacy: 'pessoal' }),
    empenhoText('payeeState', 'UF', 'Favorecido', 'uf', { privacy: 'pessoal',
weight: 1 }),
    empenhoText('payeeZipCode', 'CEP', 'Favorecido', 'cep', { type: 'cep',
privacy: 'pessoal' }),

    // Nota de Empenho
    // O "Nº empenho" de antes (sistema antigo ou nota em papel).
    empenhoText('previousNumber', 'Nº anterior', 'Nota de Empenho', 'numero'),
    empenhoText('invoiceNumber', 'Nota fiscal', 'Nota de Empenho', 'notaFiscal'),
    empenhoText('bank', 'Banco', 'Nota de Empenho', 'banco', { privacy: 'pessoal' }),
    empenhoText('bankAgency', 'Agência', 'Nota de Empenho', 'agencia', { privacy: 'pessoal' }),
    empenhoText('bankAccount', 'Conta', 'Nota de Empenho', 'conta', { privacy: 'pessoal' }),
    empenhoText('checkNumber', 'Cheque', 'Nota de Empenho', 'cheque'),

    // Sistema
    { key: 'attachments',
label: 'Comprovantes',
group: 'Sistema',
type: 'number',
privacy: 'comum',
value: t => t.attachments.length },
    { key: 'createdAt',
label: 'Lançado em',
group: 'Sistema',
type: 'datetime',
privacy: 'comum',
value: t => t.createdAt },
];

/** As 13 colunas da planilha de hoje, na ordem de hoje. Congeladas pelo teste de ouro. */
const PADRAO = [
    'number', 'date', 'type', 'account', 'category', 'description', 'payeeName', 'payeeDocument', 'previousNumber', 'method',
    'recurring', 'amount', 'notes',
];

/**
 * "Período: 01/01/2026 a 31/01/2026 · Tipo: Saída · Categoria: INSUMOS ·
 * Caixa: BANCO · Forma de pagamento: PIX · Busca: coop · Ordem: Nº". Categoria
 * e caixa vêm das linhas (filtradas por eles, todas têm o mesmo); sem nenhuma,
 * pelo id.
 */
async function describeFilters(f: FinanceFilters, rows: Row[], repo: ExportRepository): Promise<ExportFilterDescription[]> {
    const out: ExportFilterDescription[] = [...describePeriod(f.from && ymd(f.from), f.to && ymd(f.to))];
    if (f.type) out.push({ nome: filterLabels.type,
valor: TYPE_LABEL[f.type] });
    if (f.categoryId || f.accountId) {
        let category = f.categoryId ? rows[0]?.category?.name : undefined;
        let account = f.accountId ? rows[0]?.account?.name : undefined;
        if ((f.categoryId && !category) || (f.accountId && !account)) {
            const names = await repo.financeNames({ categoryId: f.categoryId,
accountId: f.accountId });
            category ??= names.category ?? undefined;
            account ??= names.account ?? undefined;
        }
        if (f.categoryId) out.push({ nome: filterLabels.categoryId,
valor: category ?? f.categoryId });
        if (f.accountId) out.push({ nome: filterLabels.accountId,
valor: account ?? f.accountId });
    }
    if (f.method) out.push({ nome: filterLabels.method,
valor: f.method });
    if (f.search) out.push({ nome: filterLabels.search,
valor: f.search });
    // A ordem por data é a de sempre; só a por Nº é dita.
    if (f.orderBy === 'number') out.push({ nome: filterLabels.orderBy,
valor: 'Nº' });
    return out;
}

export const financeTransactionsSource: ExportSource<Row, FinanceFilters> = {
    dataset: 'finance-transactions',
    filters,
    filterLabels,
    describeFilters,
    fields: [...financeFields, ...reportFields<Row>()],
    padrao: PADRAO,
    modelos: [{ id: 'resumido',
name: 'Resumido',
fields: ['number', 'date', 'description', 'payeeName', 'amount'] }],
    // `to` é um dia: inclui o dia inteiro, como a lista.
    query: (repo, { from, to, ...rest }, take) => repo.financeTransactions({ ...rest,
from,
to: endOfDay(to),
take }),
    firstName: row => row.description,
    // A mesma mensagem da lista e da rota antiga ("Parâmetro inválido: from").
    filterMessage: issue => (issue.path.length ? `Parâmetro inválido: ${issue.path.map(String).join('.')}` : 'Parâmetros inválidos'),
    sortKeys: ['orderBy'],
};
