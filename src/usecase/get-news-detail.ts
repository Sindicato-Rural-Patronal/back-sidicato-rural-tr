import type { NewsRepository, NewsModel } from '../ports/external/news-repository.js';
import { NewsNotFoundError } from '../errors/not-found.js';

type GetNewsDetailResponse = {
    error?: Error;
    news?: NewsModel;
};

export class GetNewsDetailUseCase {
    constructor(private readonly newsRepository: NewsRepository) {}

    async execute(id: string): Promise<GetNewsDetailResponse> {
        const news = await this.newsRepository.findById(id);
        // Rota pública: rascunhos (não PUBLISHED) não devem vazar por UUID.
        if (!news || news.status !== 'PUBLISHED') {
            return { error: new NewsNotFoundError() };
        }
        return { news };
    }
}
