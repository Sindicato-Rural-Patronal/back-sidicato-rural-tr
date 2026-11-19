import { ForbiddenError } from '../../errors/auth.js';
import { BusinessRuleError } from '../../errors/business-rule.js';
import { ConflictError } from '../../errors/conflict.js';
import { NotFoundError } from '../../errors/not-found.js';
import { ValidationError } from '../../errors/validation.js';
import { isPrismaUniqueViolation } from '../../lib/prisma-errors.js';
import type {
    ReportTemplateModel, ReportTemplateRepository, ReportTemplateUpdate,
} from '../../ports/external/report-template-repository.js';
import { EXPORT_DATASETS, type ExportDataset } from './datasets.js';
import { NO_BUILDER_MESSAGE, sourceOf, type AnyExportSource } from './catalog/index.js';
import {
    FORMAT_LABEL, PADRAO_MODELO_ID, PADRAO_MODELO_NAME,
    deniedFieldsError, readFieldKeys, readFormat, resolveFields,
    type ExportActor, type ExportFormat,
} from './engine.js';
import { readVisaoFilters, sourceHasVisoes } from './visoes.js';

// Modelos de relatório salvos pela equipe (decisão 006, fase 3, SR-114).
//
// - São da equipe toda, e não de uma pessoa (decisão do usuário em 11/11).
// - As chaves são as do catálogo da fonte, na ordem das colunas. Chave que
//   saiu do catálogo continua gravada: a listagem a tira de `fields` e a põe
//   em `missingFields`, para o montador avisar.
// - Ver e usar pedem a permissão de exportar o conjunto (na rota). Salvar pede
//   também poder exportar todos os campos do modelo (403 com os rótulos, como
//   na exportação). Mudar e excluir pedem poder exportar todos os campos do
//   modelo como ele está (e, mudando os campos, como ele fica): quem tem menos
//   permissão não desfaz o modelo de quem tem mais, a mesma ideia das regras
//   de acesso (anti-escalonamento).

export const TEMPLATE_LIMITS = {
    /** Caracteres no nome: o mesmo limite do `modelo` da exportação, que leva o nome. */
    name: 64,
    /** Modelos ativos por conjunto: a listagem não é paginada. */
    perDataset: 100,
} as const;

export const TEMPLATE_MESSAGES = {
    notFound: 'Modelo não encontrado.',
    nameRequired: 'Informe o nome do modelo.',
    nameTooLong: `O nome do modelo pode ter até ${TEMPLATE_LIMITS.name} caracteres.`,
    nameTaken: 'Já existe um modelo da equipe com esse nome.',
    factoryName: 'Já existe um modelo de fábrica com esse nome.',
    fieldsRequired: 'Escolha pelo menos um campo.',
    nothingToChange: 'Nada para alterar.',
    tooMany: `Este relatório já tem ${TEMPLATE_LIMITS.perDataset} modelos da equipe. Exclua um antes de salvar outro.`,
    // Nas fontes com visões (decisão 007), o modelo da equipe é uma "visão" na tela.
    visaoNameTaken: 'Já existe uma visão da equipe com esse nome.',
    visaoFactoryName: 'Já existe uma visão de fábrica com esse nome.',
} as const;

/** Quem pede: o id vai para createdById/updatedById; as permissões, para os campos. */
export type TemplateActor = ExportActor & { id: string };

export type TemplateAdminRef = {
    id: string;
    /** O usuário (login) do administrador; null se não for achado. */
    username: string | null;
};

/** O modelo como a API devolve. */
export type ReportTemplateView = {
    id: string;
    dataset: string;
    name: string;
    /** As chaves que ainda existem no catálogo, na ordem das colunas. */
    fields: string[];
    /** As chaves gravadas que saíram do catálogo ([] quando nenhuma). */
    missingFields: string[];
    /** csv | pdf | xlsx; null = sem preferência. */
    format: string | null;
    /** Só em `registrations` ("Só confirmadas"); null nos outros. */
    confirmed: boolean | null;
    /** Os filtros que a visão liga (decisão 007; só nas fontes com visões); null = nenhum. */
    filters: Record<string, unknown> | null;
    createdAt: Date;
    updatedAt: Date;
    createdBy: TemplateAdminRef;
    /** Quem mudou por último; null enquanto ninguém mudou. */
    updatedBy: TemplateAdminRef | null;
};

type Body = Record<string, unknown>;

const bodyOf = (input: unknown): Body =>
    input && typeof input === 'object' && !Array.isArray(input) ? (input as Body) : {};

/** Nome sem caractere de controle, com os espaços juntados; de 1 a 64. */
export function readTemplateName(value: unknown): string | Error {
    const name = typeof value === 'string' ? value.replace(/[\p{Cc}\s]+/gu, ' ').trim() : '';
    if (!name) return new ValidationError(TEMPLATE_MESSAGES.nameRequired);
    if (name.length > TEMPLATE_LIMITS.name) return new ValidationError(TEMPLATE_MESSAGES.nameTooLong);
    return name;
}

/** undefined = não veio; null ou "" = sem preferência; senão csv, pdf ou xlsx. */
function readTemplateFormat(value: unknown): ExportFormat | null | undefined | Error {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    return readFormat(value);
}

const sameName = (a: string, b: string) => a.toLocaleLowerCase('pt-BR') === b.toLocaleLowerCase('pt-BR');

/**
 * O nome é o de um modelo de fábrica (ou o id dele, ou o Padrão), ou o de uma
 * visão de fábrica (ou o id dela)? A exportação troca o id pelo nome.
 */
function isFactoryName(source: AnyExportSource, name: string): boolean {
    const factory = [
        PADRAO_MODELO_ID, PADRAO_MODELO_NAME,
        ...source.modelos.flatMap(m => [m.id, m.name]),
        ...(source.visoes ?? []).flatMap(v => [v.id, v.name]),
    ];
    return factory.some(f => sameName(f, name));
}

/** O alvo da auditoria: "Pessoas: Nome e CPF". */
function auditLabelOf(dataset: ExportDataset, name: string): string {
    return `${EXPORT_DATASETS[dataset].title}: ${name}`;
}

/** Os campos do modelo que ainda estão no catálogo, para conferir permissão. */
function knownFields(source: AnyExportSource, keys: string[]) {
    const byKey = new Map(source.fields.map(f => [f.key, f]));
    return keys.flatMap(k => byKey.get(k) ?? []);
}

/**
 * O modelo como está pede um campo que quem pede não pode exportar: não pode
 * mudar nem excluir (quem tem menos permissão não desfaz o modelo de quem tem mais).
 */
function lockedByFields(source: AnyExportSource, template: ReportTemplateModel, actor: ExportActor): ForbiddenError | null {
    const denied = knownFields(source, template.fields).filter(f => f.permission && !actor.has(f.permission));
    if (!denied.length) return null;
    return new ForbiddenError(`Este modelo tem campos que você não pode exportar: ${denied.map(f => f.label).join(', ')}.`);
}

/** Os campos pedidos: de 1 a 80 chaves do catálogo, sem repetir, todas permitidas a quem pede. */
function readTemplateFields(source: AnyExportSource, value: unknown, actor: ExportActor): string[] | Error {
    const keys = readFieldKeys(value);
    if (keys instanceof Error) return keys;
    if (!keys) return new ValidationError(TEMPLATE_MESSAGES.fieldsRequired);
    const fields = resolveFields(source.fields, keys);
    if (fields instanceof Error) return fields;
    return deniedFieldsError(fields, actor) ?? keys;
}

/**
 * Os valores de um modelo para o "o que mudou" da auditoria: os campos pelo
 * rótulo do catálogo (a chave, se saiu dele) e o formato pelo nome.
 */
export function reportTemplateAuditSnapshot(
    template: Pick<ReportTemplateModel, 'dataset' | 'name' | 'fields' | 'format' | 'confirmed'>,
    /** Os filtros da visão em palavras (`visaoFiltersText`); só vale nas fontes com visões. */
    filtersText: string | null = null,
): Record<string, unknown> {
    const source = sourceOf(template.dataset as ExportDataset);
    const labelOf = new Map((source?.fields ?? []).map(f => [f.key, f.label]));
    return {
        name: template.name,
        fields: template.fields.map(k => labelOf.get(k) ?? k).join(', '),
        format: template.format ? (FORMAT_LABEL[template.format as ExportFormat] ?? template.format) : null,
        ...(template.dataset === 'registrations' && { onlyConfirmed: template.confirmed ?? false }),
        ...(source && sourceHasVisoes(source) && { filters: filtersText }),
    };
}

type Outcome<T> = { error?: Error } & T;

const nameTakenMessage = (source: AnyExportSource) =>
    (sourceHasVisoes(source) ? TEMPLATE_MESSAGES.visaoNameTaken : TEMPLATE_MESSAGES.nameTaken);

const isFiltersObject = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);

export class ReportTemplatesUseCase {
    constructor(private readonly repo: ReportTemplateRepository) {}

    /** Os modelos da equipe do conjunto, pelo nome. Conjunto sem montador → 404, como o catálogo. */
    async list(dataset: ExportDataset): Promise<Outcome<{ templates?: ReportTemplateView[] }>> {
        const source = sourceOf(dataset);
        if (!source) return { error: new NotFoundError(NO_BUILDER_MESSAGE) };
        const rows = await this.repo.listActive(dataset);
        const sorted = [...rows].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
        return { templates: await this.views(source, sorted) };
    }

    async create(
        dataset: ExportDataset,
        input: unknown,
        actor: TemplateActor,
    ): Promise<Outcome<{
 template?: ReportTemplateView;
auditLabel?: string
}>> {
        const source = sourceOf(dataset);
        if (!source) return { error: new NotFoundError(NO_BUILDER_MESSAGE) };
        const body = bodyOf(input);

        const name = readTemplateName(body.name);
        if (name instanceof Error) return { error: name };
        const fields = readTemplateFields(source, body.fields, actor);
        if (fields instanceof Error) return { error: fields };
        const format = readTemplateFormat(body.format);
        if (format instanceof Error) return { error: format };
        const filters = readVisaoFilters(source, body.filters);
        if (filters instanceof Error) return { error: filters };

        const conflict = await this.nameConflict(source, dataset, name, null);
        if (conflict) return { error: conflict };

        try {
            const created = await this.repo.create({
                dataset,
                name,
                fields,
                format: format ?? null,
                confirmed: dataset === 'registrations' ? body.confirmed === true : null,
                filters: filters ?? null,
                createdById: actor.id,
            });
            const [template] = await this.views(source, [created]);
            return { template,
auditLabel: auditLabelOf(dataset, name) };
        } catch (e) {
            // Outro pedido gravou o mesmo nome ao mesmo tempo: o índice parcial segura.
            if (isPrismaUniqueViolation(e)) return { error: new ConflictError(nameTakenMessage(source)) };
            throw e;
        }
    }

    async update(
        dataset: ExportDataset,
        id: string,
        input: unknown,
        actor: TemplateActor,
    ): Promise<Outcome<{
 template?: ReportTemplateView;
auditLabel?: string
}>> {
        const source = sourceOf(dataset);
        if (!source) return { error: new NotFoundError(NO_BUILDER_MESSAGE) };
        const current = await this.repo.findActive(dataset, id);
        if (!current) return { error: new NotFoundError(TEMPLATE_MESSAGES.notFound) };
        const locked = lockedByFields(source, current, actor);
        if (locked) return { error: locked };

        const body = bodyOf(input);
        const data: ReportTemplateUpdate = { updatedById: actor.id };
        if (body.name !== undefined) {
            const name = readTemplateName(body.name);
            if (name instanceof Error) return { error: name };
            data.name = name;
        }
        if (body.fields !== undefined) {
            const fields = readTemplateFields(source, body.fields, actor);
            if (fields instanceof Error) return { error: fields };
            data.fields = fields;
        }
        const format = readTemplateFormat(body.format);
        if (format instanceof Error) return { error: format };
        if (format !== undefined) data.format = format;
        if (dataset === 'registrations' && typeof body.confirmed === 'boolean') data.confirmed = body.confirmed;
        const filters = readVisaoFilters(source, body.filters);
        if (filters instanceof Error) return { error: filters };
        if (filters !== undefined) data.filters = filters;
        if (Object.keys(data).length === 1) return { error: new ValidationError(TEMPLATE_MESSAGES.nothingToChange) };

        if (data.name !== undefined) {
            const conflict = await this.nameConflict(source, dataset, data.name, id);
            if (conflict) return { error: conflict };
        }

        const previousName = current.name;
        try {
            const updated = await this.repo.update(id, data);
            if (!updated) return { error: new NotFoundError(TEMPLATE_MESSAGES.notFound) };
            const [template] = await this.views(source, [updated]);
            const renamed = updated.name !== previousName;
            const label = auditLabelOf(dataset, updated.name) + (renamed ? ` (antes ${previousName})` : '');
            return { template,
auditLabel: label };
        } catch (e) {
            if (isPrismaUniqueViolation(e)) return { error: new ConflictError(nameTakenMessage(source)) };
            throw e;
        }
    }

    /** Soft-delete: o modelo sai da lista e o nome fica livre de novo. */
    async remove(dataset: ExportDataset, id: string, actor: TemplateActor): Promise<Outcome<{ auditLabel?: string }>> {
        const source = sourceOf(dataset);
        if (!source) return { error: new NotFoundError(NO_BUILDER_MESSAGE) };
        const current = await this.repo.findActive(dataset, id);
        if (!current) return { error: new NotFoundError(TEMPLATE_MESSAGES.notFound) };
        const locked = lockedByFields(source, current, actor);
        if (locked) return { error: locked };
        if (!(await this.repo.softDelete(id, actor.id))) return { error: new NotFoundError(TEMPLATE_MESSAGES.notFound) };
        return { auditLabel: auditLabelOf(dataset, current.name) };
    }

    /** Nome de modelo de fábrica, nome de outro modelo ativo do conjunto ou o conjunto cheio (só ao criar). */
    private async nameConflict(
        source: AnyExportSource,
        dataset: ExportDataset,
        name: string,
        selfId: string | null,
    ): Promise<Error | null> {
        if (isFactoryName(source, name)) {
            return new ConflictError(sourceHasVisoes(source) ? TEMPLATE_MESSAGES.visaoFactoryName : TEMPLATE_MESSAGES.factoryName);
        }
        const active = await this.repo.listActive(dataset);
        if (active.some(t => t.id !== selfId && sameName(t.name, name))) return new ConflictError(nameTakenMessage(source));
        if (selfId === null && active.length >= TEMPLATE_LIMITS.perDataset) return new BusinessRuleError(TEMPLATE_MESSAGES.tooMany);
        return null;
    }

    private async views(source: AnyExportSource, rows: ReportTemplateModel[]): Promise<ReportTemplateView[]> {
        const usernames = await this.repo.adminUsernames(
            rows.flatMap(t => (t.updatedById ? [t.createdById, t.updatedById] : [t.createdById])),
        );
        const known = new Set(source.fields.map(f => f.key));
        const ref = (adminId: string): TemplateAdminRef => ({ id: adminId,
username: usernames.get(adminId) ?? null });
        return rows.map(t => ({
            id: t.id,
            dataset: t.dataset,
            name: t.name,
            fields: t.fields.filter(k => known.has(k)),
            missingFields: t.fields.filter(k => !known.has(k)),
            format: t.format,
            confirmed: t.confirmed,
            filters: isFiltersObject(t.filters) ? t.filters : null,
            createdAt: t.createdAt,
            updatedAt: t.updatedAt,
            createdBy: ref(t.createdById),
            updatedBy: t.updatedById ? ref(t.updatedById) : null,
        }));
    }
}
