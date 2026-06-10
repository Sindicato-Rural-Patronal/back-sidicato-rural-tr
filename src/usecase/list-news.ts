import type { NewsRepository, NewsStatus, NewsModel } from '../ports/external/news-repository.js';

type PagedResult<T> = {
    data: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
};
type ListNewsResponse = {
    error?: Error;
    result?: PagedResult<NewsModel>;
};

export class ListNewsUseCase {
    constructor(private readonly newsRepository: NewsRepository) {}

    async execute(statusFilter?: NewsStatus, page = 1, limit = 20): Promise<ListNewsResponse> {
        const skip = (page - 1) * limit;
        console.log(
            `[ListNews] statusFilter="${statusFilter ?? 'all'}" page=${page} limit=${limit}`,
        );
        const [news, total] = await Promise.all([
            this.newsRepository.findAll(statusFilter, skip, limit),
            this.newsRepository.count(statusFilter),
        ]);
        return {
            result: { data: news,
total,
page,
limit,
totalPages: Math.ceil(total / limit) },
        };
    }
}
