import type { ExportDataset } from '../datasets.js';
import { adminsSource } from './admins.js';
import { auditLogsSource } from './audit-logs.js';
import { companiesSource } from './companies.js';
import { contactMessagesSource } from './contact-messages.js';
import { coursesSource } from './courses.js';
import { peopleSource } from './people.js';
import { propertiesSource } from './properties.js';
import { registrationsSource } from './registrations.js';
import { roomBookingsSource } from './room-bookings.js';
import { unimedSource } from './unimed.js';
import type { EngineDataset, ExportSource } from './types.js';

// Fontes que já passaram para o montador de relatórios (decisão 006, fases 1
// e 2). As outras continuam no caminho antigo (`usecase/export-data.ts`).

/** Fonte com os tipos apagados, para a tabela abaixo (cada uma é tipada no próprio arquivo). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyExportSource = ExportSource<any, any>;

export const EXPORT_SOURCES: Record<EngineDataset, AnyExportSource> = {
    people: peopleSource,
    registrations: registrationsSource,
    companies: companiesSource,
    properties: propertiesSource,
    admins: adminsSource,
    courses: coursesSource,
    'contact-messages': contactMessagesSource,
    unimed: unimedSource,
    'audit-logs': auditLogsSource,
    'room-bookings': roomBookingsSource,
};

export function sourceOf(dataset: ExportDataset): AnyExportSource | null {
    return (EXPORT_SOURCES as Record<string, AnyExportSource | undefined>)[dataset] ?? null;
}

export const NO_BUILDER_MESSAGE = 'Este conjunto ainda não tem o montador.';
