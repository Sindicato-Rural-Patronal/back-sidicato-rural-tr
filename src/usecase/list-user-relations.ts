import type { UserRelationRepository, UserRelationWithTarget } from '../ports/external/user-relation-repository.js';

type ListUserRelationsResult = {
    data: UserRelationWithTarget[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
};

type ListUserRelationsResponse = { error?: Error; result?: ListUserRelationsResult };

export class ListUserRelationsUseCase {
    constructor(private readonly userRelationRepository: UserRelationRepository) {}

    async execute(sourceId: string, page = 1, limit = 20): Promise<ListUserRelationsResponse> {
        const skip = (page - 1) * limit;
        const [data, total] = await Promise.all([
            this.userRelationRepository.findBySourceId(sourceId, skip, limit),
            this.userRelationRepository.countBySourceId(sourceId),
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
