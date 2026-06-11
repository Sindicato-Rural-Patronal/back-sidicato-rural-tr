import type { NewsRepository } from '../ports/external/news-repository.js';
import { NewsNotFoundError } from '../errors/not-found.js';

type DeleteNewsResponse = { error?: Error };

export class DeleteNewsUseCase {
    constructor(private readonly newsRepository: NewsRepository) {}

    async execute(newsId: string): Promise<DeleteNewsResponse> {
        console.log(`[DeleteNews] newsId="${newsId}"`);
        const existing = await this.newsRepository.findById(newsId);
        if (!existing) {
            console.log(`[DeleteNews] news not found: ${newsId}`);
            return { error: new NewsNotFoundError() };
        }

        const deleted = await this.newsRepository.delete(newsId);
        if (!deleted) return { error: new Error('Failed to delete news') };

        console.log(`[DeleteNews] success`);
        return {};
    }
}
