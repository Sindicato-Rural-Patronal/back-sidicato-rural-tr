import type { PrismaClient } from '@prisma/client/extension';
import type { DashboardRepository, QuotePeriod } from '../../ports/external/dashboard-repository.js';

export function createDashboardAdapter(prisma: PrismaClient): DashboardRepository {
    return new DashboardAdapter(prisma);
}

class DashboardAdapter implements DashboardRepository {
    constructor(private prisma: PrismaClient) {}

    countPendingConfirmation(coursesEndingFrom: Date): Promise<number> {
        return this.prisma.courseUserRegistration.count({
            where: {
                isDeleted: false,
                confirmed: false,
                // Curso que ainda não terminou: no último dia ele ainda conta.
                course: { isDeleted: false,
endTime: { gte: coursesEndingFrom } },
            },
        });
    }

    countCoursesStarting(from: Date, before: Date): Promise<number> {
        return this.prisma.course.count({
            where: {
                isDeleted: false,
                status: { in: ['PUBLIC', 'PRIVATE'] },
                startTime: { gte: from,
lt: before },
            },
        });
    }

    async lastQuotePeriodOfDay(from: Date, before: Date): Promise<QuotePeriod | null> {
        // Um lançamento grava todos os produtos de uma vez; basta o período mais
        // recente do dia. A ordem do enum é MORNING, AFTERNOON → desc traz a
        // tarde primeiro; linha antiga sem período fica por último.
        const row: { period: QuotePeriod | null } | null =
            await this.prisma.marketQuoteHistory.findFirst({
                where: { referenceDate: { gte: from,
lt: before } },
                select: { period: true },
                orderBy: [{ period: { sort: 'desc',
nulls: 'last' } }, { createdAt: 'desc' }],
            });
        return row?.period ?? null;
    }
}
