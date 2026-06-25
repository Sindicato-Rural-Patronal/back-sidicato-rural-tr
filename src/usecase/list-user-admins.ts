import type {
    UserAdminRepository,
    UserAdminWithDetails,
    UserAdminListFilters,
} from '../ports/external/user-admin-repository.js';

type PagedResult<T> = {
    data: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
};
type ListUserAdminsResponse = {
    error?: Error;
    result?: PagedResult<UserAdminWithDetails>;
};

export class ListUserAdminsUseCase {
    constructor(private userAdminRepository: UserAdminRepository) {}

    async execute(page = 1, limit = 20, filters?: UserAdminListFilters): Promise<ListUserAdminsResponse> {
        const skip = (page - 1) * limit;
        const [admins, total] = await Promise.all([
            this.userAdminRepository.findAll(filters, skip, limit),
            this.userAdminRepository.count(filters),
        ]);
        console.log(`[ListUserAdmins] page=${page} limit=${limit} total=${total}`);
        return {
            result: { data: admins,
total,
page,
limit,
totalPages: Math.ceil(total / limit) },
        };
    }
}
