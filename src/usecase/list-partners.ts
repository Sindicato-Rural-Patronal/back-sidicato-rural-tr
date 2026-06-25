import type { UserDataRepository, PartnerItem } from '../ports/external/user-data-repository.js';

type Response = { error?: Error; partners?: PartnerItem[] };

export class ListPartnersUseCase {
    constructor(private readonly repo: UserDataRepository) {}

    async execute(): Promise<Response> {
        const partners = await this.repo.findAllPartners();
        return { partners };
    }
}
