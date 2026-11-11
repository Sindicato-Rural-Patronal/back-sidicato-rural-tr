import { z } from 'zod';
import type { ExportFilterDescription } from './catalog/types.js';

// Leitura dos filtros das exportações: o mesmo para GET (tudo texto na query)
// e POST (JSON). Usado pelo montador e pelo caminho antigo.

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
