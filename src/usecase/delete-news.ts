import type { NewsRepository } from '../ports/external/news-repository.js';
import { NewsNotFoundError } from '../errors/not-found.js';

type DeleteNewsResponse = { error?: Error };

export class DeleteNewsUseCase {
    constructor(private readonly newsRepository: NewsRepository) {}

    async execute(newsId: string): Promise<DeleteNewsResponse> {
        const existing = await this.newsRepository.findById(newsId);
        if (!existing) {
            return { error: new NewsNotFoundError() };
        }

        const deleted = await this.newsRepository.delete(newsId);
        if (!deleted) return { error: new Error('Failed to delete news') };

        return {};
    }
}
