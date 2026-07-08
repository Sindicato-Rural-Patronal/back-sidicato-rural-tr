import type { BannerRepository, BannerModel } from '../ports/external/banner-repository.js';
import { paginate } from '../lib/pagination.js';

type Response = {
    error?: Error;
    data?: BannerModel[];
    total?: number;
    page?: number;
    limit?: number;
    totalPages?: number;
};

export class ListAllBannersUseCase {
    constructor(private readonly repo: BannerRepository) {}

    async execute(page = 1, limit = 20): Promise<Response> {
        return paginate(
            page,
            limit,
            (skip, take) => this.repo.findAll(skip, take),
            () => this.repo.count(),
        );
    }
}
