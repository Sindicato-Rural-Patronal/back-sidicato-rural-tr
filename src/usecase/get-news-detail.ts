import type { NewsRepository, NewsModel } from '../ports/external/news-repository.js';
import { NewsNotFoundError } from '../errors/not-found.js';
import { isNewsVisible, nowWallClock } from './news-visibility.js';

type GetNewsDetailResponse = {
    error?: Error;
    news?: NewsModel;
};

export class GetNewsDetailUseCase {
    constructor(private readonly newsRepository: NewsRepository) {}

    async execute(id: string, at: Date = nowWallClock()): Promise<GetNewsDetailResponse> {
        const news = await this.newsRepository.findById(id);
        // Rota pública: rascunho e notícia agendada não vazam por UUID.
        if (!news || !isNewsVisible(news, at)) {
            return { error: new NewsNotFoundError() };
        }
        return { news };
    }
}
