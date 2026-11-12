import { csvMoney } from '../../lib/csv.js';
import type { XlsxCell, XlsxSheet } from '../../lib/xlsx.js';
import type { ExportField, ExportFieldType } from './catalog/types.js';

// O montador em Excel (.xlsx, SR-104): o tipo do campo no catálogo decide a
// célula. Texto continua texto (telefone, CPF, CNS e CEP nunca viram número),
// dinheiro é número com formato de moeda, data e data e hora são datas de
// verdade. O título, os filtros e os campos vão numa aba "Sobre", depois da
// dos dados: a primeira linha da aba dos dados é o cabeçalho, então ordenar,
// filtrar e montar tabela dinâmica funcionam sem mexer em nada.

const MIN_WIDTH = 8;
const MAX_WIDTH = 60;
/** "Assinatura" e outras colunas em branco: largas, para escrever à mão. */
const BLANK_WIDTH = 30;

const asDate = (v: unknown) => (v instanceof Date && Number.isFinite(v.getTime()) ? v : null);

const brasilia = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
});

/**
 * O instante no horário de Brasília, como uma data cujos campos UTC são a hora
 * de lá (o .xlsx não tem fuso: a célula é a hora "de parede").
 */
export function brasiliaWallClock(d: Date): Date {
    const p = Object.fromEntries(brasilia.formatToParts(d).map(x => [x.type, x.value]));
    return new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second)));
}

/**
 * A célula pelo tipo do campo. `text`: o texto que o CSV e o PDF mostram
 * (`cellValue` do motor, sem o `'` contra fórmula), usado nos tipos que são
 * texto.
 */
export function xlsxCell(type: ExportFieldType, raw: unknown, text: () => string): XlsxCell {
    switch (type) {
        case 'number':
            return typeof raw === 'number' && Number.isFinite(raw) ? { kind: 'number',
value: raw } : null;
        case 'money':
            return typeof raw === 'number' && Number.isFinite(raw) ? { kind: 'money',
value: raw } : null;
        case 'date': {
            const d = asDate(raw);
            return d ? { kind: 'date',
value: d } : null;
        }
        case 'datetime': {
            const d = asDate(raw);
            return d ? { kind: 'datetime',
value: brasiliaWallClock(d) } : null;
        }
        case 'wallclock': {
            const d = asDate(raw);
            return d ? { kind: 'datetime',
value: d } : null;
        }
        case 'blank':
            return null;
        default:
            // text, list, boolean (Sim/Não), cpf, cnpj, cep, phone, cns
            return { kind: 'text',
value: text() };
    }
}

/** Quantos caracteres a célula ocupa na tela, para a largura da coluna. */
function cellLength(cell: XlsxCell): number {
    if (!cell) return 0;
    switch (cell.kind) {
        case 'text':
            return Math.max(0, ...cell.value.split('\n').map(line => line.length));
        case 'number':
            return String(cell.value).length;
        case 'money':
            return csvMoney(cell.value).length + 3;
        case 'date':
            return 10;
        case 'datetime':
            return 16;
    }
}

/** Largura em caracteres: o maior entre o cabeçalho e o conteúdo, de 8 a 60. */
export function columnWidth(header: string, type: ExportFieldType, cells: XlsxCell[]): number {
    const content = cells.reduce((max, c) => Math.max(max, cellLength(c)), 0);
    const base = type === 'blank' ? Math.max(BLANK_WIDTH, content) : content;
    // O cabeçalho é em negrito: um pouco mais largo.
    const width = Math.max(Math.ceil(header.length * 1.1), base) + 2;
    return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width));
}

/**
 * A aba dos dados: cabeçalho preso, uma coluna por campo. `cell` dá a célula
 * de cada campo numa linha (o motor sabe o `index` e o modo antigo).
 */
export function dataSheet<Row>(
    name: string,
    fields: ExportField<Row>[],
    rows: Row[],
    cell: (field: ExportField<Row>, row: Row, index: number) => XlsxCell,
): XlsxSheet {
    const table = rows.map((row, i) => fields.map(f => cell(f, row, i + 1)));
    return {
        name,
        header: fields.map(f => f.label),
        widths: fields.map((f, col) => columnWidth(f.label, f.type, table.map(r => r[col]))),
        rows: table,
    };
}

/** "Sobre": o que é a planilha, em pares rótulo e valor. */
export function aboutSheet(items: [string, XlsxCell][]): XlsxSheet {
    return {
        name: 'Sobre',
        widths: [Math.max(MIN_WIDTH, ...items.map(([label]) => label.length + 2)), 80],
        rows: items.map(([label, value]) => [{ kind: 'text',
value: label,
bold: true }, value]),
    };
}

/** Como a tela da Auditoria chama o escopo. */
export const SCOPE_WORDS: Record<string, string> = {
    'seleção': 'Selecionados',
    'com filtros': 'Todos com os filtros',
    todos: 'Todos',
};
