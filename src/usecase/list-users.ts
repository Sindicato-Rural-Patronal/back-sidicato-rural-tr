import type { UserDataRepository, UserListFilters } from '../ports/external/user-data-repository.js';
import type { UserDataModel } from '../generated/prisma/models/UserData.js';
import { paginate, type PagedResult } from '../lib/pagination.js';

type ListUsersResponse = {
    error?: Error;
    result?: PagedResult<UserDataModel>;
};

export class ListUsersUseCase {
    constructor(private userDataRepository: UserDataRepository) {}

    async execute(page = 1, limit = 20, filters?: UserListFilters): Promise<ListUsersResponse> {
        return {
            result: await paginate(
                page,
                limit,
                (skip, take) => this.userDataRepository.findAll(filters, skip, take),
                () => this.userDataRepository.count(filters),
            ),
        };
    }
}
