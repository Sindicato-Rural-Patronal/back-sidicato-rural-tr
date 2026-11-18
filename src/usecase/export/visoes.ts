import { ValidationError } from '../../errors/validation.js';
import type { ExportRepository } from '../../ports/external/export-repository.js';
import type { AnyExportSource } from './catalog/index.js';
import type { ExportField, ExportFieldType, ExportPrivacy } from './catalog/types.js';
import {
    TYPE_WEIGHT, cellValue, deniedFieldsError, filtersText, readFieldKeys, resolveFields,
    type ExportActor,
} from './engine.js';
import { cellDisplay } from '../../lib/csv.js';
import { todayInBrazil } from '../../lib/quote-products.js';

// Visões da tela (decisão 007): a lista mostra as colunas do catálogo, e a
// visão guarda colunas e filtros. Este arquivo tem as duas peças que a lista e
// os modelos da equipe usam:
//
// - as células da lista (`lerColunasDoCatalogo` + `celulasDoCatalogo`): o
//   mesmo catálogo e a mesma função de célula da exportação, então a tela e o
//   arquivo saem iguais por construção. A célula é a do PDF: sem o `'` contra
//   fórmula e com a máscara do telefone e do CNS (como com `fields`);
// - os filtros que uma visão guarda (`readVisaoFilters`), só nas fontes que
//   têm `visoes` no catálogo (hoje, `finance-transactions`).

// ── Colunas e células da lista ───────────────────────────────────────────────

/** Uma coluna da lista com `fields`: o que o front precisa para desenhar. */
export type CatalogColumn = {
    key: string;
    label: string;
    type: ExportFieldType;
    /** Largura relativa, a mesma do PDF. */
    weight: number;
    privacy: ExportPrivacy;
};

/**
 * Lê `fields` da query da lista ("a,b,c"), com as mesmas regras e mensagens da
 * exportação: de 1 a 80 chaves do catálogo, sem repetir, todas permitidas a
 * quem pede (403 "Sem permissão para exportar: …").
 */
export function lerColunasDoCatalogo<Row>(
    source: AnyExportSource,
    value: unknown,
    actor: ExportActor,
): ExportField<Row>[] | Error {
    const keys = readFieldKeys(value);
    if (keys instanceof Error) return keys;
    if (!keys) return new ValidationError('Escolha pelo menos um campo.');
    const fields = resolveFields<Row>(source.fields, keys);
    if (fields instanceof Error) return fields;
    return deniedFieldsError(fields, actor) ?? fields;
}

/** As colunas, na ordem pedida. */
export function catalogColumns<Row>(fields: ExportField<Row>[]): CatalogColumn[] {
    return fields.map(f => ({
        key: f.key,
        label: f.label,
        type: f.type,
        weight: f.weight ?? TYPE_WEIGHT[f.type],
        privacy: f.privacy,
    }));
}

/**
 * As células de cada linha, como no PDF da exportação. `offset` é quantas
 * linhas vêm antes desta página: o "Nº de ordem" (`ordinal`) conta a lista
 * inteira, a partir de `offset + 1`. O vazio é "".
 */
export function celulasDoCatalogo<Row>(
    fields: ExportField<Row>[],
    rows: Row[],
    { offset, now }: {
        offset: number;
        now: Date;
    },
): string[][] {
    const today = todayInBrazil(now);
    return rows.map((row, i) =>
        fields.map(f => cellDisplay(cellValue(f.type, f.value(row, { today,
index: offset + i + 1 }), false))));
}

// ── Filtros que a visão guarda ───────────────────────────────────────────────

/** Período relativo da visão: o front calcula as datas pelo dia de Brasília. */
export const VISAO_PERIODOS = ['mes-atual', 'mes-passado', 'ano-atual', 'ultimos-12-meses'] as const;
export type VisaoPeriodo = (typeof VISAO_PERIODOS)[number];

export const VISAO_PERIODO_LABEL: Record<VisaoPeriodo, string> = {
    'mes-atual': 'mês atual',
    'mes-passado': 'mês passado',
    'ano-atual': 'ano atual',
    'ultimos-12-meses': 'últimos 12 meses',
};

/** Filtros da fonte que a visão nunca guarda: datas fixas ficam velhas, a busca é do momento, a seleção é da hora. */
export const VISAO_FILTROS_FORA = ['from', 'to', 'search', 'ids'] as const;

/** Tamanho máximo dos filtros guardados, em JSON. */
export const VISAO_FILTERS_MAX_BYTES = 2048;

export const VISAO_MESSAGES = {
    notSupported: 'Este relatório não guarda filtros.',
    tooBig: 'Os filtros da visão passam de 2 KB.',
    invalid: (campo: string) => `Filtro inválido na visão: ${campo.slice(0, 64)}.`,
} as const;

/** A fonte guarda filtros na visão? Só as que têm visões de fábrica. */
export const sourceHasVisoes = (source: AnyExportSource): boolean => Boolean(source.visoes?.length);

/** As chaves que a visão pode guardar: os filtros da fonte, menos os de `VISAO_FILTROS_FORA`, mais `periodo`. */
export function visaoFilterKeys(source: AnyExportSource): string[] {
    const fora = new Set<string>(VISAO_FILTROS_FORA);
    return [...Object.keys(source.filterLabels).filter(k => !fora.has(k)), 'periodo'];
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Os filtros de uma visão, já normalizados: só os que estão ligados. Valor
 * `null` ou "" é "não guardar" e sai; `false` (sim/não desligado) também,
 * porque a fonte o trata como ausente. Os valores passam pelo schema da fonte
 * (os mesmos da lista). Sem nenhum filtro ligado → null.
 *
 * `undefined` = não veio (o chamador decide). Fonte sem visões → 400
 * "Este relatório não guarda filtros.".
 */
export function readVisaoFilters(
    source: AnyExportSource,
    value: unknown,
): Record<string, unknown> | null | undefined | Error {
    if (value === undefined) return undefined;
    if (!sourceHasVisoes(source)) {
        return value === null ? undefined : new ValidationError(VISAO_MESSAGES.notSupported);
    }
    if (value === null) return null;
    if (!isPlainObject(value)) return new ValidationError(VISAO_MESSAGES.invalid('filters'));
    if (Buffer.byteLength(JSON.stringify(value), 'utf8') > VISAO_FILTERS_MAX_BYTES) {
        return new ValidationError(VISAO_MESSAGES.tooBig);
    }

    const allowed = new Set(visaoFilterKeys(source));
    const out: Record<string, unknown> = {};
    const toParse: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
        if (!allowed.has(key)) return new ValidationError(VISAO_MESSAGES.invalid(key));
        if (v === null || v === '') continue;
        if (key === 'periodo') {
            if (typeof v !== 'string' || !(VISAO_PERIODOS as readonly string[]).includes(v)) {
                return new ValidationError(VISAO_MESSAGES.invalid('periodo'));
            }
            out.periodo = v;
            continue;
        }
        // Só texto, número e sim/não: o schema da fonte não pode receber objeto.
        if (typeof v === 'object') return new ValidationError(VISAO_MESSAGES.invalid(key));
        toParse[key] = v;
    }

    const parsed = source.filters.safeParse(toParse);
    if (!parsed.success) {
        const issue = parsed.error.issues[0];
        return new ValidationError(VISAO_MESSAGES.invalid(String(issue?.path[0] ?? 'filters')));
    }
    const data = parsed.data as Record<string, unknown>;
    // Na ordem dos filtros da fonte, com o período no fim.
    const ordered: Record<string, unknown> = {};
    for (const key of visaoFilterKeys(source)) {
        if (key === 'periodo') {
            if (out.periodo !== undefined) ordered.periodo = out.periodo;
        } else if (key in toParse && data[key] !== undefined) {
            ordered[key] = data[key];
        }
    }
    return Object.keys(ordered).length ? ordered : null;
}

/**
 * Os filtros da visão em palavras, para a auditoria: as mesmas frases da linha
 * "Filtros:" do PDF ("Tipo: Entrada · Sem transferências entre caixas"), mais o
 * período relativo ("Período: mês passado"). Categoria e caixa pelo nome (pelo
 * id, com `repo`). null sem filtro.
 */
export async function visaoFiltersText(
    source: AnyExportSource,
    filters: unknown,
    repo: ExportRepository,
): Promise<string | null> {
    if (!isPlainObject(filters) || !Object.keys(filters).length) return null;
    const { periodo, ...rest } = filters;
    const parsed = source.filters.safeParse(rest);
    const parts: string[] = [];
    if (parsed.success) {
        const words = filtersText(await source.describeFilters(parsed.data, [], repo));
        if (words) parts.push(words);
    } else {
        // Gravado antes de uma regra nova: sai como está, chave por chave.
        parts.push(Object.entries(rest).map(([k, v]) => `${source.filterLabels[k] ?? k}: ${String(v)}`).join(' · '));
    }
    if (typeof periodo === 'string') {
        parts.push(`Período: ${VISAO_PERIODO_LABEL[periodo as VisaoPeriodo] ?? periodo}`);
    }
    return parts.filter(Boolean).join(' · ') || null;
}
