import type { PropertyRepository, PropertyWithAddress } from '../ports/external/property-repository.js';

type ListUserPropertiesResult = {
    data: PropertyWithAddress[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
};

type ListUserPropertiesResponse = { error?: Error; result?: ListUserPropertiesResult };

export class ListUserPropertiesUseCase {
    constructor(private readonly propertyRepository: PropertyRepository) {}

    async execute(userDataId: string, page = 1, limit = 20): Promise<ListUserPropertiesResponse> {
        const skip = (page - 1) * limit;
        const [data, total] = await Promise.all([
            this.propertyRepository.findByUserDataId(userDataId, skip, limit),
            this.propertyRepository.countByUserDataId(userDataId),
        ]);
        return {
            result: {
                data,
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };
    }
}
