import { PrismaClient } from '@prisma/client/extension';
import { NewsRepository, NewsModel, NewsCreateData, NewsUpdateData, NewsStatus } from '../../ports/external/news-repository.js';

export function createNewsAdapter(prisma: PrismaClient): NewsRepository {
    return new NewsAdapter(prisma);
}

export class NewsAdapter implements NewsRepository {
    constructor(private prisma: PrismaClient) {}

    create(data: NewsCreateData): Promise<NewsModel> {
        return this.prisma.news.create({ data }) as Promise<NewsModel>;
    }

    findById(id: string): Promise<NewsModel | null> {
        return this.prisma.news.findUnique({ where: { id } }) as Promise<NewsModel | null>;
    }

    findAll(statusFilter?: NewsStatus): Promise<NewsModel[]> {
        return this.prisma.news.findMany({
            where: statusFilter ? { status: statusFilter } : undefined,
            orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
        }) as Promise<NewsModel[]>;
    }

    async update(id: string, data: NewsUpdateData): Promise<NewsModel | null> {
        try {
            return await this.prisma.news.update({ where: { id }, data }) as NewsModel;
        } catch {
            return null;
        }
    }

    async delete(id: string): Promise<boolean> {
        try {
            await this.prisma.news.delete({ where: { id } });
            return true;
        } catch {
            return false;
        }
    }

    async updateBanner(id: string, bannerUrl: string): Promise<NewsModel | null> {
        try {
            return await this.prisma.news.update({ where: { id }, data: { bannerUrl } }) as NewsModel;
        } catch {
            return null;
        }
    }
}
