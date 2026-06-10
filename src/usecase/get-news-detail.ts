import type { NewsRepository, NewsModel } from '../ports/external/news-repository.js';
import { NewsNotFoundError } from '../errors/not-found.js';

type GetNewsDetailResponse = {
    error?: Error;
    news?: NewsModel;
};

export class GetNewsDetailUseCase {
    constructor(private readonly newsRepository: NewsRepository) {}

    async execute(id: string): Promise<GetNewsDetailResponse> {
        console.log(`[GetNewsDetail] id="${id}"`);
        const news = await this.newsRepository.findById(id);
        if (!news) {
            console.log(`[GetNewsDetail] not found: ${id}`);
            return { error: new NewsNotFoundError() };
        }
        console.log(`[GetNewsDetail] found: title="${news.title}" status="${news.status}"`);
        return { news };
    }
}
