import { z } from 'zod';
import type { ExportFilterDescription } from './catalog/types.js';

// Leitura dos filtros das exportações: o mesmo para GET (tudo texto na query)
// e POST (JSON).

export const empty = (v: unknown) => (v === '' || v == null ? undefined : v);
export const text = z.preprocess(empty, z.string().trim().max(200).optional());
export const bool = z.preprocess(
    v => (v === true || v === 'true' ? true : v === false || v === 'false' ? false : undefined),
    z.boolean().optional(),
);
export const enumOf = <T extends Record<string, string>>(e: T) =>
    z.preprocess(empty, z.enum(Object.values(e) as [T[keyof T], ...T[keyof T][]], { message: 'Filtro inválido' }).optional());
export const day = z.preprocess(empty, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida: use AAAA-MM-DD').optional());
// "a,b,c" (GET) ou ['a','b'] (POST). Lista enviada vazia é erro: exportaria tudo sem querer.
export const idList = z.preprocess(
    v => {
        if (v == null) return undefined;
        const list = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : v;
        return Array.isArray(list) ? list.map(s => String(s).trim()).filter(Boolean) : list;
    },
    z
        .array(z.string().max(64))
        .min(1, 'Nenhum registro selecionado')
        .max(5000, 'Selecione no máximo 5000 registros')
        .optional(),
);

/** "2026-01-31" → "31/01/2026". */
const brDay = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;

/**
 * O período de um filtro de dias (AAAA-MM-DD) em palavras: "Período:
 * 01/01/2026 a 31/01/2026", "Dia: 05/10/2026" (início = fim), "De: …" ou
 * "Até: …" (só uma ponta). Sem nenhuma, nada.
 */
export function describePeriod(from: string | undefined, to: string | undefined): ExportFilterDescription[] {
    if (from && to) {
        return from === to
            ? [{ nome: 'Dia',
valor: brDay(from) }]
            : [{ nome: 'Período',
valor: `${brDay(from)} a ${brDay(to)}` }];
    }
    if (from) return [{ nome: 'De',
valor: brDay(from) }];
    if (to) return [{ nome: 'Até',
valor: brDay(to) }];
    return [];
}

/**
 * Os filtros em palavras, na ordem de `labels`: texto como veio, sim/não,
 * enum pelo rótulo (`enums`). Filtro sem rótulo não aparece.
 */
export function describeByLabels(
    filters: Record<string, unknown>,
    labels: Record<string, string>,
    enums: Record<string, Record<string, string>> = {},
): ExportFilterDescription[] {
    const out: ExportFilterDescription[] = [];
    for (const [key, nome] of Object.entries(labels)) {
        const v = filters[key];
        if (v === undefined || v === null || v === '') continue;
        if (typeof v === 'boolean') out.push({ nome,
valor: v ? 'Sim' : 'Não' });
        else if (Array.isArray(v)) out.push({ nome,
valor: `${v.length}` });
        else out.push({ nome,
valor: enums[key]?.[String(v)] ?? String(v) });
    }
    return out;
}
