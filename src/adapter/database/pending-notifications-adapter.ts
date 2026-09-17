import type { PrismaClient } from '@prisma/client/extension';
import type {
    NamedCount,
    PendingCourse,
    PendingCourseFilter,
    PendingNotificationsRepository,
} from '../../ports/external/pending-notifications-repository.js';
import { buildUserListWhere } from './list-filters.js';

export function createPendingNotificationsAdapter(
    prisma: PrismaClient,
): PendingNotificationsRepository {
    return new PendingNotificationsAdapter(prisma);
}

// Inscrição que ainda espera a equipe confirmar.
const unconfirmedRegistration = { confirmed: false,
isDeleted: false } as const;

type CourseRow = {
    id: string;
    name: string;
    status: string;
    startTime: Date;
    endTime: Date;
    _count: { courseUserRegistration: number };
};

function dateRange(from?: Date, before?: Date) {
    if (!from && !before) return undefined;
    return { ...(from && { gte: from }),
...(before && { lt: before }) };
}

class PendingNotificationsAdapter implements PendingNotificationsRepository {
    constructor(private prisma: PrismaClient) {}

    async listCourses(filter: PendingCourseFilter): Promise<PendingCourse[]> {
        const startTime = dateRange(filter.startFrom, filter.startBefore);
        const endTime = dateRange(filter.endFrom, filter.endBefore);
        const rows: CourseRow[] = await this.prisma.course.findMany({
            where: {
                isDeleted: false,
                status: { in: filter.statuses },
                ...(startTime && { startTime }),
                ...(endTime && { endTime }),
                ...(filter.onlyWithUnconfirmed && {
                    courseUserRegistration: { some: unconfirmedRegistration },
                }),
            },
            select: {
                id: true,
                name: true,
                status: true,
                startTime: true,
                endTime: true,
                _count: { select: { courseUserRegistration: { where: unconfirmedRegistration } } },
            },
            orderBy: [{ [filter.orderBy]: 'asc' }, { id: 'asc' }],
            take: filter.take,
        });
        return rows.map(({ _count, ...c }) => ({
            ...c,
            unconfirmedCount: _count.courseUserRegistration,
        }));
    }

    countQuoteHistory(from: Date, before: Date): Promise<number> {
        return this.prisma.marketQuoteHistory.count({
            where: { referenceDate: { gte: from,
lt: before } },
        });
    }

    async galleriesWithoutPhoto(take: number): Promise<NamedCount> {
        const where = { isActive: true,
photos: { none: {} } };
        const [total, rows] = await Promise.all([
            this.prisma.galleryAlbum.count({ where }),
            this.prisma.galleryAlbum.findMany({
                where,
                select: { title: true },
                orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
                take,
            }),
        ]);
        return { total,
names: rows.map((r: { title: string }) => r.title) };
    }

    async partnersWithoutLogo(take: number): Promise<NamedCount> {
        const where = {
            isDeleted: false,
            isPartner: true,
            OR: [{ partnerLogo: null }, { partnerLogo: '' }],
        };
        const [total, rows] = await Promise.all([
            this.prisma.company.count({ where }),
            this.prisma.company.findMany({
                where,
                select: { name: true,
tradeName: true },
                orderBy: [{ partnerOrder: { sort: 'asc',
nulls: 'last' } }, { name: 'asc' }],
                take,
            }),
        ]);
        return {
            total,
            names: rows.map(
                (r: {
 name: string;
tradeName: string | null 
}) => r.tradeName?.trim() || r.name,
            ),
        };
    }

    countIncompleteRegistrations(): Promise<number> {
        return this.prisma.userData.count({
            where: buildUserListWhere({ incompleteRegistration: true }),
        });
    }

    async membershipsExpiring(from: Date, before: Date, take: number): Promise<NamedCount> {
        const where = {
            isDeleted: false,
            memberStatus: 'ACTIVE' as const,
            membershipValidUntil: { gte: from,
lt: before },
        };
        const [total, rows] = await Promise.all([
            this.prisma.userData.count({ where }),
            this.prisma.userData.findMany({
                where,
                select: { name: true },
                orderBy: [{ membershipValidUntil: 'asc' }, { name: 'asc' }],
                take,
            }),
        ]);
        return { total,
names: rows.map((r: { name: string }) => r.name) };
    }
}
