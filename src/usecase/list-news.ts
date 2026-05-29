import { NewsRepository, NewsStatus } from '../ports/external/news-repository.js';

type ListNewsResponse = {
    success: boolean;
    error?: Error;
    news?: Awaited<ReturnType<NewsRepository['findAll']>>;
};

export class ListNewsUseCase {
    constructor(private readonly newsRepository: NewsRepository) {}

    async execute(statusFilter?: NewsStatus): Promise<ListNewsResponse> {
        const news = await this.newsRepository.findAll(statusFilter);
        return { success: true, news };
    }
}
