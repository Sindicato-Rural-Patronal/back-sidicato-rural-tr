import type { BannerRepository, BannerModel } from '../ports/external/banner-repository.js';

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
        const skip = (page - 1) * limit;
        const [data, total] = await Promise.all([
            this.repo.findAll(skip, limit),
            this.repo.count(),
        ]);
        return { data,
total,
page,
limit,
totalPages: Math.ceil(total / limit) };
    }
}
