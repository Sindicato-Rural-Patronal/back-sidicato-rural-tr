import type { ExportRepository } from '../ports/external/export-repository.js';
import { EXPORT_DATASETS, type ExportDataset } from './export/datasets.js';
import { EXPORT_SOURCES } from './export/catalog/index.js';
import { runCadastrosExport } from './export/cadastros.js';
import {
    NO_EXTRA_PERMISSIONS, runSourceExport,
    type ExportActor, type ExportResult,
} from './export/engine.js';

// Exportação de dados (`/admin/export/:dataset`, decisão 006). Desde a SR-102
// todo conjunto sai pelo montador de relatórios (`usecase/export/`): as listas
// pelo motor (`engine.ts`, uma fonte por arquivo em `catalog/`), e o relatório
// de cadastros pelo padrão das fontes de pessoas, empresas e administradores
// (`cadastros.ts`). O caminho antigo, com as colunas fixas, não existe mais.

export { EXPORT_DATASETS, type ExportDataset, type ExportResult };

// Com `ids` exporta só os selecionados (um ou vários); sem, tudo o que bate com
// os filtros da listagem. Campos, formato e permissão por campo vêm do catálogo.
export class ExportDataUseCase {
    constructor(
        private readonly repo: ExportRepository,
        private readonly now: () => Date = () => new Date(),
    ) {}

    /** `actor`: as permissões de quem exporta, para os campos que pedem uma a mais. */
    async execute(dataset: ExportDataset, query: unknown, actor: ExportActor = NO_EXTRA_PERMISSIONS): Promise<{
 error?: Error;
result?: ExportResult
}> {
        if (dataset === 'cadastros') return runCadastrosExport(this.repo, query, this.now());
        // Todo conjunto que não é o relatório de cadastros tem fonte no catálogo
        // (o tsc reprova um conjunto novo sem fonte).
        return runSourceExport(EXPORT_SOURCES[dataset], this.repo, query, { actor,
now: this.now() });
    }
}
