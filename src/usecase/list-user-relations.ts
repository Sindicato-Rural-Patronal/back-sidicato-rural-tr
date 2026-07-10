import type { UserRelationRepository, UserRelationWithTarget } from '../ports/external/user-relation-repository.js';
import { paginate, type PagedResult } from '../lib/pagination.js';

type ListUserRelationsResponse = {
    error?: Error;
    result?: PagedResult<UserRelationWithTarget>;
};

export class ListUserRelationsUseCase {
    constructor(private readonly userRelationRepository: UserRelationRepository) {}

    async execute(sourceId: string, page = 1, limit = 20): Promise<ListUserRelationsResponse> {
        return {
            result: await paginate(
                page,
                limit,
                (skip, take) => this.userRelationRepository.findBySourceId(sourceId, skip, take),
                () => this.userRelationRepository.countBySourceId(sourceId),
            ),
        };
    }
}
