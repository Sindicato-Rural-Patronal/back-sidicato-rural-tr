import type { PrismaClient } from '@prisma/client/extension';
import type {
    NewsRepository,
    NewsModel,
    NewsCreateData,
    NewsUpdateData,
    NewsListFilters,
} from '../../ports/external/news-repository.js';

/**
 * Filtros da listagem. `schedule` recorta pelo agendamento: `visible` = sem
 * agendamento ou já passou; `scheduled` = marcada para depois.
 */
export function buildNewsWhere(f: NewsListFilters) {
    const search = f.search?.trim();
    return {
        isDeleted: false,
        ...(f.status && { status: f.status }),
        ...(f.schedule?.state === 'visible' && {
            OR: [{ publishAt: null }, { publishAt: { lte: f.schedule.at } }],
        }),
        ...(f.schedule?.state === 'scheduled' && { publishAt: { gt: f.schedule.at } }),
        ...(search && { title: { contains: search,
mode: 'insensitive' as const } }),
    };
}

export function createNewsAdapter(prisma: PrismaClient): NewsRepository {
    return new NewsAdapter(prisma);
}

export class NewsAdapter implements NewsRepository {
    constructor(private prisma: PrismaClient) {}

    create(data: NewsCreateData): Promise<NewsModel> {
        return this.prisma.news.create({ data }) as Promise<NewsModel>;
    }

    findById(id: string): Promise<NewsModel | null> {
        return this.prisma.news.findFirst({ where: { id,
isDeleted: false } }) as Promise<NewsModel | null>;
    }

    findAll(filters: NewsListFilters, skip?: number, take?: number): Promise<NewsModel[]> {
        return this.prisma.news.findMany({
            where: buildNewsWhere(filters),
            orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
            skip,
            take,
        }) as Promise<NewsModel[]>;
    }

    count(filters: NewsListFilters): Promise<number> {
        return this.prisma.news.count({ where: buildNewsWhere(filters) });
    }

    async update(id: string, data: NewsUpdateData): Promise<NewsModel | null> {
        try {
            return (await this.prisma.news.update({ where: { id },
data })) as NewsModel;
        } catch {
            return null;
        }
    }

    async delete(id: string): Promise<boolean> {
        try {
            await this.prisma.news.update({
                where: { id },
                data: { isDeleted: true,
deletedAt: new Date() },
            });
            return true;
        } catch {
            return false;
        }
    }

    async updateBanner(id: string, bannerUrl: string): Promise<NewsModel | null> {
        try {
            return (await this.prisma.news.update({
                where: { id },
                data: { bannerUrl },
            })) as NewsModel;
        } catch {
            return null;
        }
    }
}
