import { NewsRepository, NewsModel } from '../ports/external/news-repository.js';

type GetNewsDetailResponse = {
    success: boolean;
    error?: Error;
    news?: NewsModel;
};

export class GetNewsDetailUseCase {
    constructor(private readonly newsRepository: NewsRepository) {}

    async execute(id: string): Promise<GetNewsDetailResponse> {
        const news = await this.newsRepository.findById(id);
        if (!news) {
            return { success: false, error: new Error('News not found') };
        }
        return { success: true, news };
    }
}
