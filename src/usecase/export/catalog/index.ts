import type { ExportDataset } from '../datasets.js';
import { peopleSource } from './people.js';
import { registrationsSource } from './registrations.js';
import type { EngineDataset, ExportSource } from './types.js';

// Fontes que já passaram para o montador de relatórios (decisão 006, fase 1).
// As outras continuam no caminho antigo (`usecase/export-data.ts`) até a fase 2.

/** Fonte com os tipos apagados, para a tabela abaixo (cada uma é tipada no próprio arquivo). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyExportSource = ExportSource<any, any>;

export const EXPORT_SOURCES: Record<EngineDataset, AnyExportSource> = {
    people: peopleSource,
    registrations: registrationsSource,
};

export function sourceOf(dataset: ExportDataset): AnyExportSource | null {
    return (EXPORT_SOURCES as Record<string, AnyExportSource | undefined>)[dataset] ?? null;
}

export const NO_BUILDER_MESSAGE = 'Este conjunto ainda não tem o montador.';
