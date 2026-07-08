import type { BannerRepository, BannerModel } from '../ports/external/banner-repository.js';
import { paginate } from '../lib/pagination.js';

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
        return paginate(
            page,
            limit,
            (skip, take) =>
                this.repo
                    .findAllActive(skip, take)
                    .then(all =>
                        all.map(({ id, title, subtitle, imageUrl, buttons }) => ({ id,
title,
subtitle,
imageUrl,
buttons })),
                    ),
            () => this.repo.countActive(),
        );
    }
}
