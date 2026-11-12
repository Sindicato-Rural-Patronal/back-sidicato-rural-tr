import type { PrismaClient } from '../../generated/prisma/client.js';
import type { ReportTemplateRepository } from '../../ports/external/report-template-repository.js';
import { semRegistro } from './prisma-errors.js';

// Modelos de relatório da equipe (decisão 006, fase 3, SR-114). Exclusão é
// lógica, como no resto do sistema; o nome único entre os ativos é o índice
// parcial "ReportTemplate_dataset_name_active_key" da migração.
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

        create(data) {
            return prisma.reportTemplate.create({ data });
        },

        async update(id, data) {
            try {
                return await prisma.reportTemplate.update({ where: { id,
isDeleted: false },
data });
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
