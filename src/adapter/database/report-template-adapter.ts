import { Prisma, type PrismaClient } from '../../generated/prisma/client.js';
import type { ReportTemplateRepository } from '../../ports/external/report-template-repository.js';
import { semRegistro } from './prisma-errors.js';

// Modelos de relatório da equipe (decisão 006, fase 3, SR-114). Exclusão é
// lógica, como no resto do sistema; o nome único entre os ativos é o índice
// parcial "ReportTemplate_dataset_name_active_key" da migração.

/** `filters` (Json?): null vira o NULL do banco (o Prisma pede `DbNull`); undefined não mexe. */
function jsonFilters(filters: Record<string, unknown> | null | undefined) {
    if (filters === undefined) return undefined;
    return filters === null ? Prisma.DbNull : (filters as Prisma.InputJsonObject);
}

export function createReportTemplateAdapter(prisma: PrismaClient): ReportTemplateRepository {
    return {
        listActive(dataset) {
            return prisma.reportTemplate.findMany({
                where: { dataset,
isDeleted: false },
                orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
            });
        },

        findActive(dataset, id) {
            return prisma.reportTemplate.findFirst({ where: { id,
dataset,
isDeleted: false } });
        },

        create({ filters, ...data }) {
            return prisma.reportTemplate.create({ data: { ...data,
filters: jsonFilters(filters) } });
        },

        async update(id, { filters, ...data }) {
            try {
                return await prisma.reportTemplate.update({ where: { id,
isDeleted: false },
data: { ...data,
filters: jsonFilters(filters) } });
            } catch (e) {
                return semRegistro(e, null);
            }
        },

        async softDelete(id, actorId) {
            const r = await prisma.reportTemplate.updateMany({
                where: { id,
isDeleted: false },
                data: { isDeleted: true,
deletedAt: new Date(),
updatedById: actorId },
            });
            return r.count > 0;
        },

        async adminUsernames(ids) {
            const unique = [...new Set(ids)];
            if (!unique.length) return new Map();
            const admins = await prisma.userAdmin.findMany({
                where: { id: { in: unique } },
                select: { id: true,
username: true },
            });
            return new Map(admins.map(a => [a.id, a.username]));
        },
    };
}
