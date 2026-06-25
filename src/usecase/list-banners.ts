import type { BannerRepository, BannerModel } from '../ports/external/banner-repository.js';

type Response = {
    error?: Error;
    data?: Pick<BannerModel, 'id' | 'title' | 'subtitle' | 'imageUrl' | 'buttons'>[];
    total?: number;
    page?: number;
    limit?: number;
    totalPages?: number;
};

export class ListBannersUseCase {
    constructor(private readonly repo: BannerRepository) {}

    async execute(page = 1, limit = 20): Promise<Response> {
        const skip = (page - 1) * limit;
        const [all, total] = await Promise.all([
            this.repo.findAllActive(skip, limit),
            this.repo.countActive(),
        ]);
        const data = all.map(({ id, title, subtitle, imageUrl, buttons }) => ({
            id,
            title,
            subtitle,
            imageUrl,
            buttons,
        }));
        return { data,
total,
page,
limit,
totalPages: Math.ceil(total / limit) };
    }
}
