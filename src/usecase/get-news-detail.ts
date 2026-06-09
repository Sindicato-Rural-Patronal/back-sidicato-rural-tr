import type { NewsRepository, NewsModel } from '../ports/external/news-repository.js';

type GetNewsDetailResponse = {
    success: boolean;
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
            return { success: false, error: new Error('News not found') };
        }
        console.log(`[GetNewsDetail] found: title="${news.title}" status="${news.status}"`);
        return { success: true, news };
    }
}
