import type { NewsRepository, NewsListFilters, NewsModel } from '../ports/external/news-repository.js';
import { paginate, type PagedResult } from '../lib/pagination.js';

type ListNewsResponse = {
    error?: Error;
    result?: PagedResult<NewsModel>;
};

export class ListNewsUseCase {
    constructor(private readonly newsRepository: NewsRepository) {}

    async execute(filters: NewsListFilters = {}, page = 1, limit = 20): Promise<ListNewsResponse> {
        return {
            result: await paginate(
                page,
                limit,
                (skip, take) => this.newsRepository.findAll(filters, skip, take),
                () => this.newsRepository.count(filters),
            ),
        };
    }
}
