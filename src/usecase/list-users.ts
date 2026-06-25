import type { UserDataRepository, UserListFilters } from '../ports/external/user-data-repository.js';
import type { UserDataModel } from '../generated/prisma/models/UserData.js';

type PagedResult<T> = {
    data: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
};
type ListUsersResponse = {
    error?: Error;
    result?: PagedResult<UserDataModel>;
};

export class ListUsersUseCase {
    constructor(private userDataRepository: UserDataRepository) {}

    async execute(page = 1, limit = 20, filters?: UserListFilters): Promise<ListUsersResponse> {
        const skip = (page - 1) * limit;
        const [users, total] = await Promise.all([
            this.userDataRepository.findAll(filters, skip, limit),
            this.userDataRepository.count(filters),
        ]);
        console.log(`[ListUsers] page=${page} limit=${limit} total=${total}`);
        return {
            result: { data: users,
total,
page,
limit,
totalPages: Math.ceil(total / limit) },
        };
    }
}
