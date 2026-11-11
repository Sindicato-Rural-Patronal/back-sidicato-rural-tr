import { z } from 'zod';
import type { ExportRepository } from '../../ports/external/export-repository.js';
import { ValidationError } from '../../errors/validation.js';
import { toCsvSections } from '../../lib/csv.js';
import { todayInBrazil } from '../../lib/quote-products.js';
import { EXPORT_DATASETS } from './datasets.js';
import { NO_BUILDER_MESSAGE } from './catalog/index.js';
import { adminsSource } from './catalog/admins.js';
import { companiesSource } from './catalog/companies.js';
import { peopleSource } from './catalog/people.js';
import { padraoCsvBody, type ExportResult } from './engine.js';
import { ymd } from './format.js';

// Relatório de cadastros (`cadastros`, decisão 006, inventário, item 16): o
// retrato fixo de quatro conjuntos num arquivo só — pessoas físicas,
// associados em dia, pessoas jurídicas e administradores —, sem filtro nem
// seleção. Não tem montador (catálogo 404, `fields` e PDF 400): quem quer só
// uma parte usa o montador de cada conjunto.
//
// Desde a SR-102 as quatro seções são o padrão das fontes do motor (`people`,
// `companies` e `admins`), byte a byte como as colunas antigas de
// export-data.ts (teste de ouro). A linha da auditoria continua a de sempre,
// sem `details`.

// O relatório é sempre o retrato completo: filtro e seleção são ignorados.
const schema = z.object({});

export async function runCadastrosExport(
    repo: ExportRepository,
    query: unknown,
    now: Date,
): Promise<{
 error?: Error;
result?: ExportResult 
}> {
    const parsed = schema.safeParse(query ?? {});
    if (!parsed.success) {
        return { error: new ValidationError(parsed.error.issues[0]?.message ?? 'Filtro inválido') };
    }
    const body = (query ?? {}) as Record<string, unknown>;
    const format = body.format == null || body.format === '' ? 'csv' : String(body.format).trim().toLowerCase();
    if (format !== 'csv' && format !== 'pdf') return { error: new ValidationError('Formato inválido: use csv ou pdf.') };
    if (format === 'pdf' || body.fields != null) return { error: new ValidationError(NO_BUILDER_MESSAGE) };

    const [pessoas, associados, empresas, administradores] = await Promise.all([
        repo.people({}),
        repo.people({ activeMember: true }),
        repo.companies({}),
        repo.admins({}),
    ]);
    const csv = toCsvSections([
        { title: 'PESSOAS FISICAS',
body: padraoCsvBody(peopleSource, pessoas, now) },
        { title: 'ASSOCIADOS EM DIA',
body: padraoCsvBody(peopleSource, associados, now) },
        { title: 'PESSOAS JURIDICAS',
body: padraoCsvBody(companiesSource, empresas, now) },
        { title: 'ADMINISTRADORES',
body: padraoCsvBody(adminsSource, administradores, now) },
    ]);
    // O total do relatório é a soma dos quatro: é o número que a tela mostra
    // em "planilha com N registros baixada".
    const count = pessoas.length + associados.length + empresas.length + administradores.length;
    const meta = EXPORT_DATASETS.cadastros;
    return {
        result: {
            format: 'csv',
            csv,
            count,
            filename: `${meta.file}-${ymd(todayInBrazil(now))}.csv`,
            auditLabel: `${meta.title}: ${count} registro${count === 1 ? '' : 's'} (todos)`,
            auditDetails: null,
        },
    };
}
