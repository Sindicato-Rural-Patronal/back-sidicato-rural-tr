import type { NewsRepository, NewsStatus, NewsModel } from '../ports/external/news-repository.js';
import { paginate, type PagedResult } from '../lib/pagination.js';

type ListNewsResponse = {
    error?: Error;
    result?: PagedResult<NewsModel>;
};

export class ListNewsUseCase {
    constructor(private readonly newsRepository: NewsRepository) {}

    async execute(statusFilter?: NewsStatus, page = 1, limit = 20): Promise<ListNewsResponse> {
        return {
            result: await paginate(
                page,
                limit,
                (skip, take) => this.newsRepository.findAll(statusFilter, skip, take),
                () => this.newsRepository.count(statusFilter),
            ),
        };
    }
}
