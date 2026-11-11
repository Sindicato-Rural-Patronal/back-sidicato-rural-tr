import { z } from 'zod';
import type {
    AdminExportRow,
    AuditLogExportRow,
    AuditLogFilters,
    CompanyExportRow,
    ExportAddress,
    ExportRepository,
    RoomBookingExportRow,
} from '../ports/external/export-repository.js';
import { ValidationError } from '../errors/validation.js';
import {
    csvBody, csvDateTime, csvList, csvWallClock, toCsv, toCsvSections,
    type CsvColumn,
} from '../lib/csv.js';
import {
    ADDRESS_TYPE_LABEL,
    BOOKING_TYPE_LABEL,
    COMPANY_TYPE_LABEL,
    label,
} from '../lib/export-labels.js';
import { todayInBrazil } from '../lib/quote-products.js';
import { describeAuditAction } from '../lib/audit-sentence.js';
import { formatChanges } from '../lib/audit-diff.js';
import { describeUserAgent } from '../lib/user-agent.js';
import { EXPORT_DATASETS, type ExportDataset } from './export/datasets.js';
import { day, empty, idList, text } from './export/filters.js';
import { formatCep, formatCnpj, formatCpf, propertyLine, slug, ymd } from './export/format.js';
import { NO_BUILDER_MESSAGE, sourceOf } from './export/catalog/index.js';
import type { EngineDataset } from './export/catalog/types.js';
import { peopleSource } from './export/catalog/people.js';
import {
    NO_EXTRA_PERMISSIONS, padraoCsvBody, runSourceExport,
    type ExportActor, type ExportResult,
} from './export/engine.js';

// Exportação de dados (`/admin/export/:dataset`). As fontes de
// `export/catalog/index.ts` já passaram para o montador de relatórios
// (`usecase/export/`, decisão 006); as outras continuam aqui, com as colunas
// fixas, até a parte B da fase 2.

export { EXPORT_DATASETS, type ExportDataset, type ExportResult };

// ── Leitura da query (conjuntos do caminho antigo) ───────────────────────────

const schemas = {
    // O relatorio e sempre o retrato completo: nao aceita filtro nem selecao.
    cadastros: z.object({}),
    'audit-logs': z.object({
        action: z.preprocess(empty, z.enum(['create', 'edit', 'delete', 'export', 'login', 'login_failed']).optional()),
        entity: text,
        actorId: text,
        ip: text,
        from: day,
        to: day,
        q: text,
    }),
    'room-bookings': z.object({
        ids: idList,
        from: day,
        to: day,
        roomId: text,
        type: z.preprocess(empty, z.enum(['EVENT', 'MEETING'], { message: 'Filtro inválido' }).optional()),
        search: text,
    }),
} satisfies Record<Exclude<ExportDataset, EngineDataset>, z.ZodTypeAny>;

type LegacyDataset = keyof typeof schemas;

// ── Formatação ───────────────────────────────────────────────────────────────

/** Colunas de endereço separadas (planilha filtrável por cidade, CEP…). */
function addressColumns<T>(prefix: string, get: (row: T) => ExportAddress | null | undefined): CsvColumn<T>[] {
    const col = (header: string, pick: (a: ExportAddress) => string | null): CsvColumn<T> => ({
        header: `${prefix}${header}`,
        value: row => {
            const a = get(row);
            return a ? pick(a) : '';
        },
    });
    return [
        col('Tipo', a => label(ADDRESS_TYPE_LABEL, a.type)),
        col('Rua', a => a.street),
        col('Número', a => a.number),
        col('Complemento', a => a.complement),
        col('Bairro', a => a.neighborhood),
        col('Localidade', a => a.localityName),
        col('Estrada', a => a.road),
        col('Km', a => a.km),
        col('Lote', a => a.lot),
        col('Seção', a => a.section),
        col('Cidade', a => a.city),
        col('UF', a => a.state),
        col('CEP', a => formatCep(a.zipCode)),
    ];
}

// ── Colunas de cada conjunto ─────────────────────────────────────────────────

// As colunas de empresas e de administradores ficam aqui só para o relatório de
// cadastros, que passa para o motor por dentro na parte B da fase 2. A
// exportação de cada uma já sai pelo montador (`export/catalog/`).
const companyColumns: CsvColumn<CompanyExportRow>[] = [
    { header: 'Razão social',
value: c => c.name },
    { header: 'Nome fantasia',
value: c => c.tradeName },
    { header: 'CNPJ',
value: c => formatCnpj(c.cnpj) },
    { header: 'Inscrição estadual',
value: c => c.stateRegistration },
    { header: 'Tipo',
value: c => label(COMPANY_TYPE_LABEL, c.type) },
    { header: 'E-mail',
value: c => c.email },
    { header: 'Telefone',
value: c => c.phone },
    { header: 'Telefone 2',
value: c => c.phone2 },
    { header: 'Telefone 3',
value: c => c.phone3 },
    { header: 'Site',
value: c => c.website },
    ...addressColumns<CompanyExportRow>('Sede: ', c => c.address),
    {
        header: 'Pessoas vinculadas',
        value: c => csvList(c.members.map(m => `${m.userData.name} (${m.title})`)),
    },
    { header: 'Propriedades',
value: c => csvList(c.properties.map(propertyLine)) },
    { header: 'Parceira',
value: c => c.isPartner },
    { header: 'Link da parceria',
value: c => c.partnerUrl },
    { header: 'Observações',
value: c => c.notes },
    { header: 'Cadastrada em',
value: c => csvDateTime(c.createdAt) },
    { header: 'Atualizada em',
value: c => csvDateTime(c.updatedAt) },
];

const adminColumns: CsvColumn<AdminExportRow>[] = [
    { header: 'Usuário',
value: a => a.username },
    { header: 'Nome',
value: a => a.userData.name },
    { header: 'E-mail',
value: a => a.userData.email },
    { header: 'CPF',
value: a => formatCpf(a.userData.cpf) },
    { header: 'Telefone',
value: a => a.userData.phone },
    { header: 'Regra de acesso',
value: a => a.rules.name },
    { header: 'Criado em',
value: a => csvDateTime(a.createdAt) },
];

const auditColumns: CsvColumn<AuditLogExportRow>[] = [
    { header: 'Data e hora',
value: a => csvDateTime(a.createdAt) },
    { header: 'Quem',
value: a => a.actorName },
    // Mesma frase da tela de auditoria, sem o nome (que vai em "Alvo").
    { header: 'Ação',
value: a => describeAuditAction({ ...a,
targetLabel: null }) },
    { header: 'Área',
value: a => a.entity },
    { header: 'Alvo',
value: a => a.targetLabel },
    { header: 'Caminho',
value: a => a.path },
    { header: 'IP',
value: a => a.ip },
    { header: 'Local',
value: a => a.location },
    { header: 'Aparelho',
value: a => (a.userAgent ? describeUserAgent(a.userAgent) : null) },
    // "campo: antes → depois; …"
    { header: 'Alterações',
value: a => formatChanges(a.changes) },
];

// Horários da reserva saem como gravados (relógio de Brasília com Z, igual ao curso).
const roomBookingColumns: CsvColumn<RoomBookingExportRow>[] = [
    { header: 'Tipo',
value: b => label(BOOKING_TYPE_LABEL, b.type) },
    { header: 'Título',
value: b => b.title },
    { header: 'Sala',
value: b => b.roomName },
    { header: 'Início',
value: b => csvWallClock(b.startTime) },
    { header: 'Término',
value: b => csvWallClock(b.endTime) },
    { header: 'Responsável',
value: b => b.responsible?.name ?? b.responsibleName },
    { header: 'Descrição',
value: b => b.description },
    { header: 'Série',
value: b => !!b.seriesId },
];

// ── Caso de uso ──────────────────────────────────────────────────────────────

// Exportação de um conjunto de dados: com `ids` exporta só os selecionados
// (um ou vários); sem, tudo o que bate com os filtros da listagem. As fontes
// do montador (`export/catalog/index.ts`) saem pelo motor (campos, formato e
// permissão por campo); as outras saem em CSV com as colunas fixas.
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
        const source = sourceOf(dataset);
        if (source) return runSourceExport(source, this.repo, query, { actor,
now: this.now() });
        return this.legacy(dataset as LegacyDataset, query);
    }

    private async legacy(dataset: LegacyDataset, query: unknown): Promise<{
 error?: Error;
result?: ExportResult 
}> {
        const parsed = schemas[dataset].safeParse(query ?? {});
        if (!parsed.success) {
            return { error: new ValidationError(parsed.error.issues[0]?.message ?? 'Filtro inválido') };
        }
        // Campos e PDF só nos conjuntos que já têm o montador.
        const body = (query ?? {}) as Record<string, unknown>;
        const format = body.format == null || body.format === '' ? 'csv' : String(body.format).trim().toLowerCase();
        if (format !== 'csv' && format !== 'pdf') return { error: new ValidationError('Formato inválido: use csv ou pdf.') };
        if (format === 'pdf' || body.fields != null) return { error: new ValidationError(NO_BUILDER_MESSAGE) };

        const q = parsed.data as Record<string, unknown> & { ids?: string[] };
        const now = this.now();
        const today = todayInBrazil(now);

        const built = await this.build(dataset, q, now);
        const meta = EXPORT_DATASETS[dataset];
        const date = ymd(today);
        const single = built.count === 1 && q.ids?.length === 1 && built.firstName;
        const filename = single
            ? `${meta.single}-${slug(built.firstName!) || 'registro'}-${date}.csv`
            : `${meta.file}-${date}.csv`;
        const scope = q.ids?.length ? 'seleção' : Object.values(q).some(v => v !== undefined) ? 'com filtros' : 'todos';
        const auditLabel = single
            ? `${meta.title}: ${built.firstName}`
            : `${meta.title}: ${built.count} registro${built.count === 1 ? '' : 's'} (${scope})`;
        return { result: { format: 'csv',
csv: built.csv,
count: built.count,
filename,
auditLabel,
auditDetails: null } };
    }

    private async build(
        dataset: LegacyDataset,
        q: Record<string, unknown> & { ids?: string[] },
        now: Date,
    ): Promise<{
 csv: string;
count: number;
firstName?: string 
}> {
        switch (dataset) {
            case 'cadastros': {
                const [pessoas, associados, empresas, administradores] = await Promise.all([
                    this.repo.people({}),
                    this.repo.people({ activeMember: true }),
                    this.repo.companies({}),
                    this.repo.admins({}),
                ]);
                // As pessoas saem no padrão do montador (o mesmo CSV de hoje).
                const csv = toCsvSections([
                    { title: 'PESSOAS FISICAS',
body: padraoCsvBody(peopleSource, pessoas, now) },
                    { title: 'ASSOCIADOS EM DIA',
body: padraoCsvBody(peopleSource, associados, now) },
                    { title: 'PESSOAS JURIDICAS',
body: csvBody(companyColumns, empresas) },
                    { title: 'ADMINISTRADORES',
body: csvBody(adminColumns, administradores) },
                ]);
                // O total do relatorio e a soma dos quatro: e o numero que a
                // tela mostra em "planilha com N registros baixada".
                const count = pessoas.length + associados.length + empresas.length + administradores.length;
                return { csv,
count };
            }
            case 'audit-logs': {
                const rows = await this.repo.auditLogs(q as AuditLogFilters);
                return { csv: toCsv(auditColumns, rows),
count: rows.length };
            }
            case 'room-bookings': {
                // Dias do filtro → período [from 00:00, to + 1 dia 00:00) no relógio gravado.
                const { from, to, ...rest } = q as {
 from?: string;
to?: string;
roomId?: string;
type?: 'EVENT' | 'MEETING';
search?: string;
ids?: string[] 
};
                const rows = await this.repo.roomBookings({
                    ...rest,
                    from: from ? new Date(`${from}T00:00:00.000Z`) : undefined,
                    to: to ? new Date(new Date(`${to}T00:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000) : undefined,
                });
                return { csv: toCsv(roomBookingColumns, rows),
count: rows.length,
firstName: rows[0]?.title };
            }
        }
    }
}
