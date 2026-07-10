import type {
    UserAdminRepository,
    UserAdminWithDetails,
    UserAdminListFilters,
} from '../ports/external/user-admin-repository.js';
import { paginate, type PagedResult } from '../lib/pagination.js';

type ListUserAdminsResponse = {
    error?: Error;
    result?: PagedResult<UserAdminWithDetails>;
};

export class ListUserAdminsUseCase {
    constructor(private userAdminRepository: UserAdminRepository) {}

    async execute(page = 1, limit = 20, filters?: UserAdminListFilters): Promise<ListUserAdminsResponse> {
        return {
            result: await paginate(
                page,
                limit,
                (skip, take) => this.userAdminRepository.findAll(filters, skip, take),
                () => this.userAdminRepository.count(filters),
            ),
        };
    }
}
