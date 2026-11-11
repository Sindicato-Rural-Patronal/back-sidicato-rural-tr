import type { ReportTemplateModel } from '../../generated/prisma/models/ReportTemplate.js';

export type { ReportTemplateModel };

/** O que se grava ao criar um modelo de relatório da equipe. */
export type ReportTemplateCreate = {
    dataset: string;
    name: string;
    fields: string[];
    format: string | null;
    confirmed: boolean | null;
    createdById: string;
};

/** O que muda numa edição (só o que veio); `updatedById` é sempre quem editou. */
export type ReportTemplateUpdate = {
    name?: string;
    fields?: string[];
    format?: string | null;
    confirmed?: boolean | null;
    updatedById: string;
};

// Modelos de relatório salvos pela equipe (decisão 006, fase 3, SR-114).
export interface ReportTemplateRepository {
    /** Os modelos ativos (não excluídos) de um conjunto. */
    listActive(dataset: string): Promise<ReportTemplateModel[]>;
    /** O modelo ativo desse conjunto; null se não existe, foi excluído ou é de outro conjunto. */
    findActive(dataset: string, id: string): Promise<ReportTemplateModel | null>;
    /** Lança o P2002 do índice de nome único entre os ativos, se o nome já existe. */
    create(data: ReportTemplateCreate): Promise<ReportTemplateModel>;
    /** null se o modelo não existe ou já foi excluído. Lança o P2002 do nome, como `create`. */
    update(id: string, data: ReportTemplateUpdate): Promise<ReportTemplateModel | null>;
    /** Soft-delete (isDeleted + deletedAt); false se o modelo não existe ou já foi excluído. */
    softDelete(id: string, actorId: string): Promise<boolean>;
    /** O usuário (login) de cada administrador, para mostrar quem criou e quem mudou. */
    adminUsernames(ids: string[]): Promise<Map<string, string>>;
}
