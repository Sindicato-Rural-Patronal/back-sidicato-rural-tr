import type { PropertyRepository, PropertyWithAddress } from '../ports/external/property-repository.js';
import { paginate, type PagedResult } from '../lib/pagination.js';

type ListUserPropertiesResponse = {
    error?: Error;
    result?: PagedResult<PropertyWithAddress>;
};

export class ListUserPropertiesUseCase {
    constructor(private readonly propertyRepository: PropertyRepository) {}

    async execute(userDataId: string, page = 1, limit = 20): Promise<ListUserPropertiesResponse> {
        return {
            result: await paginate(
                page,
                limit,
                (skip, take) => this.propertyRepository.findByUserDataId(userDataId, skip, take),
                () => this.propertyRepository.countByUserDataId(userDataId),
            ),
        };
    }
}
