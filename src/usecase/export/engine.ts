import type { Permission } from '../../generated/prisma/enums.js';
import type { ExportAuditLogDetails, ExportRepository } from '../../ports/external/export-repository.js';
import { ForbiddenError } from '../../errors/auth.js';
import { ValidationError } from '../../errors/validation.js';
import {
    cellDisplay, csvBody, csvDate, csvDateTime, csvList, csvMoney, csvWallClock, toCsv,
    type CsvColumn, type CsvValue,
} from '../../lib/csv.js';
import { todayInBrazil } from '../../lib/quote-products.js';
import { EXPORT_DATASETS } from './datasets.js';
import { formatCep, formatCnpj, formatCns, formatCpf, formatPhone, slug, ymd } from './format.js';
import type { AnyExportSource } from './catalog/index.js';
import type { ExportField, ExportFieldType, ExportFilterDescription } from './catalog/types.js';

// O motor do montador de relatórios (decisão 006): lê o pedido (`fields`,
// `format`, `modelo`), resolve os campos do catálogo, confere permissões e
// limites, monta a tabela e entrega em CSV ou no JSON do PDF.
//
// Sem `fields` sai o padrão de hoje, byte a byte (teste de ouro). A única
// diferença entre "sem fields" e "fields = o padrão" é o telefone: sem
// `fields` ele sai como foi gravado, como sempre saiu; com `fields`, com
// máscara (para o Excel não virar "4,5E+10").

export const EXPORT_LIMITS = {
    /** Linhas por exportação. */
    rows: 20_000,
    /** Linhas no PDF (o navegador desenha). */
    pdfRows: 2_000,
    /** Campos por relatório. */
    fields: 80,
} as const;

export type ExportFormat = 'csv' | 'pdf';

/** Quem exporta: só o que importa aqui são as permissões. */
export type ExportActor = { has(permission: Permission): boolean };

/** Sem nenhuma permissão além da do conjunto (a rota já conferiu a dele). */
export const NO_EXTRA_PERMISSIONS: ExportActor = { has: () => false };

export const PADRAO_MODELO_ID = 'padrao';
export const PADRAO_MODELO_NAME = 'Padrão (como hoje)';

const MODELO_MAX = 64;

/** Largura relativa no PDF quando o campo não diz a sua. */
const TYPE_WEIGHT: Record<ExportFieldType, number> = {
    text: 2,
    number: 1,
    money: 1.5,
    boolean: 1,
    list: 3,
    date: 1.5,
    datetime: 2,
    wallclock: 2,
    cpf: 2,
    cnpj: 2.5,
    cep: 1.5,
    phone: 2,
    cns: 2.5,
    blank: 4,
};

export type ExportPdfColumn = {
    key: string;
    label: string;
    type: ExportFieldType;
    weight: number;
};

/** O que o front recebe para desenhar o PDF. Células já formatadas, sem o `'` do CSV. */
export type ExportPdf = {
    title: string;
    filename: string;
    count: number;
    /** Filtros em palavras ("Busca: silva · Só associados em dia"); "" sem filtro. */
    filters: string;
    modelo: string | null;
    columns: ExportPdfColumn[];
    rows: string[][];
};

/** `AuditLog.details` de uma exportação (decisão 006, item 7.2). */
export type ExportAuditDetails = ExportAuditLogDetails;

export type ExportScope = ExportAuditLogDetails['escopo'];

export type ExportResult = {
    format: ExportFormat;
    /** O arquivo, quando `format` é csv ("" no PDF). */
    csv: string;
    /** O JSON do PDF, quando `format` é pdf. */
    pdf?: ExportPdf;
    count: number;
    filename: string;
    /** Texto para a trilha de auditoria. */
    auditLabel: string;
    /** Detalhes para a trilha (null no caminho antigo). */
    auditDetails: ExportAuditDetails | null;
};

type Outcome = {
 error?: Error;
result?: ExportResult
};

// ── Leitura do pedido ────────────────────────────────────────────────────────

function readFormat(value: unknown): ExportFormat | Error {
    if (value === undefined || value === null || value === '') return 'csv';
    const v = String(value).trim().toLowerCase();
    if (v === 'csv' || v === 'pdf') return v;
    return new ValidationError('Formato inválido: use csv ou pdf.');
}

/** `fields`: "a,b,c" (GET) ou ['a','b'] (POST). undefined = o padrão. */
function readFieldKeys(value: unknown): string[] | undefined | Error {
    if (value === undefined || value === null) return undefined;
    const list = Array.isArray(value) ? value : typeof value === 'string' ? [value] : null;
    if (!list) return new ValidationError('Parâmetro inválido: fields');
    const keys = list
        .flatMap(item => String(item).split(','))
        .map(k => k.trim())
        .filter(Boolean);
    if (!keys.length) return new ValidationError('Escolha pelo menos um campo.');
    if (keys.length > EXPORT_LIMITS.fields) return new ValidationError('No máximo 80 campos por relatório.');
    return keys;
}

function readModelo(value: unknown): string | null | Error {
    if (value === undefined || value === null) return null;
    const v = String(value).trim();
    if (!v) return null;
    if (v.length > MODELO_MAX) return new ValidationError('Parâmetro inválido: modelo');
    return v;
}

/** O nome do modelo para o PDF e a auditoria: o id de fábrica vira o nome. */
function modeloName(source: AnyExportSource, modelo: string | null, usedPadrao: boolean): string | null {
    if (modelo === PADRAO_MODELO_ID) return PADRAO_MODELO_NAME;
    const factory = modelo ? source.modelos.find(m => m.id === modelo) : undefined;
    if (factory) return factory.name;
    return modelo ?? (usedPadrao ? PADRAO_MODELO_NAME : null);
}

/** Erro de chave: unknown, repetida (fica a primeira mensagem). */
export function resolveFields<Row>(
    fields: ExportField<Row>[],
    keys: string[],
): ExportField<Row>[] | Error {
    const byKey = new Map(fields.map(f => [f.key, f]));
    const seen = new Set<string>();
    const chosen: ExportField<Row>[] = [];
    for (const key of keys) {
        const field = byKey.get(key);
        if (!field) return new ValidationError(`Campo desconhecido: ${key.slice(0, MODELO_MAX)}.`);
        if (seen.has(key)) return new ValidationError(`Campo repetido: ${field.label}.`);
        seen.add(key);
        chosen.push(field);
    }
    return chosen;
}

// ── Células ──────────────────────────────────────────────────────────────────

const asDate = (v: unknown) => (v instanceof Date ? v : null);
const asText = (v: unknown) => (v == null ? null : String(v));

/** O valor da célula formatado pelo tipo; o `lib/csv.ts` faz o resto (aspas, fórmula, Sim/Não). */
export function cellValue(type: ExportFieldType, raw: unknown, legacy: boolean): CsvValue {
    switch (type) {
        case 'text':
            return asText(raw);
        case 'number':
            return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
        case 'money':
            return typeof raw === 'number' ? csvMoney(raw) : null;
        case 'boolean':
            return raw == null ? null : Boolean(raw);
        case 'list':
            return Array.isArray(raw) ? csvList(raw.map(asText)) : asText(raw);
        case 'date':
            return csvDate(asDate(raw));
        case 'datetime':
            return csvDateTime(asDate(raw));
        case 'wallclock':
            return csvWallClock(asDate(raw));
        case 'cpf':
            return formatCpf(asText(raw));
        case 'cnpj':
            return formatCnpj(asText(raw));
        case 'cep':
            return formatCep(asText(raw));
        case 'phone':
            return legacy ? asText(raw) : formatPhone(asText(raw));
        case 'cns':
            return formatCns(asText(raw));
        case 'blank':
            return '';
    }
}

type Indexed<Row> = {
 row: Row;
index: number
};

function csvColumns<Row>(fields: ExportField<Row>[], today: Date, legacy: boolean): CsvColumn<Indexed<Row>>[] {
    return fields.map(f => ({
        header: f.label,
        value: ({ row, index }) => cellValue(f.type, f.value(row, { today,
index }), legacy),
    }));
}

const indexed = <Row>(rows: Row[]): Indexed<Row>[] => rows.map((row, i) => ({ row,
index: i + 1 }));

/** A tabela padrão de uma fonte, sem o BOM (o relatório de cadastros junta várias). */
export function padraoCsvBody<Row>(source: AnyExportSource, rows: Row[], now: Date): string {
    const fields = resolveFields<Row>(source.fields, source.padrao);
    if (fields instanceof Error) throw fields;
    return csvBody(csvColumns(fields, todayInBrazil(now), true), indexed(rows));
}

// ── Auditoria ────────────────────────────────────────────────────────────────

const MAX_CITED = 5;

/**
 * Os campos pessoais e sensíveis, para o texto da auditoria: documentos
 * primeiro (a busca por "CPF" tem de achar), depois os outros na ordem das
 * colunas; até 5, depois "e mais N".
 */
export function citedPersonalFields<Row>(fields: ExportField<Row>[]): string {
    const personal = fields.filter(f => f.privacy !== 'comum');
    const ordered = [...personal.filter(f => f.group === 'Documentos'), ...personal.filter(f => f.group !== 'Documentos')];
    const labels = ordered.slice(0, MAX_CITED).map(f => f.label);
    const rest = ordered.length - labels.length;
    return labels.join(', ') + (rest > 0 ? ` e mais ${rest}` : '');
}

/** "Busca: silva · Só associados em dia". */
export function filtersText(filtros: ExportFilterDescription[]): string {
    return filtros.map(f => (f.valor === 'Sim' ? f.nome : `${f.nome}: ${f.valor}`)).join(' · ');
}

// ── Exportação ───────────────────────────────────────────────────────────────

export async function runSourceExport(
    source: AnyExportSource,
    repo: ExportRepository,
    input: unknown,
    { actor, now }: {
 actor: ExportActor;
now: Date
},
): Promise<Outcome> {
    const body = (input ?? {}) as Record<string, unknown>;

    const parsed = source.filters.safeParse(body);
    if (!parsed.success) {
        return { error: new ValidationError(parsed.error.issues[0]?.message ?? 'Filtro inválido') };
    }
    const filters = parsed.data as Record<string, unknown> & { ids?: string[] };

    const format = readFormat(body.format);
    if (format instanceof Error) return { error: format };
    const keys = readFieldKeys(body.fields);
    if (keys instanceof Error) return { error: keys };
    const modelo = readModelo(body.modelo);
    if (modelo instanceof Error) return { error: modelo };

    const legacy = keys === undefined;
    const fields = resolveFields(source.fields, keys ?? source.padrao);
    if (fields instanceof Error) return { error: fields };

    const denied = fields.filter(f => f.permission && !actor.has(f.permission));
    if (denied.length) {
        return { error: new ForbiddenError(`Sem permissão para exportar: ${denied.map(f => f.label).join(', ')}.`) };
    }

    const rows: unknown[] = await source.query(repo, filters, EXPORT_LIMITS.rows + 1);
    if (rows.length > EXPORT_LIMITS.rows) {
        return { error: new ValidationError('O relatório passa de 20.000 linhas. Use um filtro para diminuir.') };
    }
    if (format === 'pdf' && rows.length > EXPORT_LIMITS.pdfRows) {
        return { error: new ValidationError('O PDF aceita até 2.000 linhas. Baixe a planilha ou use um filtro.') };
    }

    const today = todayInBrazil(now);
    const meta = EXPORT_DATASETS[source.dataset];
    const count = rows.length;
    const firstName = rows[0] === undefined ? undefined : source.firstName(rows[0]);
    const single = count === 1 && filters.ids?.length === 1 && firstName;
    const base = single ? `${meta.single}-${slug(firstName) || 'registro'}-${ymd(today)}` : `${meta.file}-${ymd(today)}`;
    const filename = `${base}.${format}`;

    const scope: ExportScope = filters.ids?.length
        ? 'seleção'
        : Object.values(filters).some(v => v !== undefined)
            ? 'com filtros'
            : 'todos';
    const filtros: ExportFilterDescription[] = filters.ids?.length
        ? [{ nome: 'Seleção',
valor: `${filters.ids.length} registro${filters.ids.length === 1 ? '' : 's'}` }]
        : await source.describeFilters(filters, rows, repo);
    const modeloText = modeloName(source, modelo, legacy);

    const head = single
        ? `${meta.title}: ${firstName}`
        : `${meta.title}: ${count} registro${count === 1 ? '' : 's'} (${scope})`;
    const cited = citedPersonalFields(fields);
    const auditLabel = [head, format.toUpperCase(), ...(cited ? [`com ${cited}`] : [])].join(' · ');
    const auditDetails: ExportAuditDetails = {
        formato: format,
        modelo: modeloText,
        campos: fields.map(f => f.label),
        escopo: scope,
        filtros,
        linhas: count,
    };

    const common = { format,
count,
filename,
auditLabel,
auditDetails };
    if (format === 'csv') {
        return { result: { ...common,
csv: toCsv(csvColumns(fields, today, legacy), indexed(rows)) } };
    }
    const pdf: ExportPdf = {
        title: meta.title,
        filename,
        count,
        filters: filtersText(filtros),
        modelo: modeloText,
        columns: fields.map(f => ({ key: f.key,
label: f.label,
type: f.type,
weight: f.weight ?? TYPE_WEIGHT[f.type] })),
        rows: rows.map((row, i) =>
            fields.map(f => cellDisplay(cellValue(f.type, f.value(row, { today,
index: i + 1 }), legacy)))),
    };
    return { result: { ...common,
csv: '',
pdf } };
}
