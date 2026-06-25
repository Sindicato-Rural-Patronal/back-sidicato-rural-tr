import type {
    UserDataRepository,
    UserDataWithRelations,
} from '../ports/external/user-data-repository.js';
import { UserDataNotFoundError } from '../errors/not-found.js';

type GetUserDetailResponse = {
    error?: Error;
    user?: UserDataWithRelations;
};

export class GetUserDetailUseCase {
    constructor(private readonly userDataRepository: UserDataRepository) {}

    async execute(userId: string): Promise<GetUserDetailResponse> {
        console.log(`[GetUserDetail] userId="${userId}"`);
        try {
            const user = await this.userDataRepository.findByIdWithRelations(userId);
            if (!user) {
                const raw = await this.userDataRepository.findById(userId);
                if (!raw) {
                    console.log(`[GetUserDetail] not found — userId="${userId}" (does not exist or isDeleted=true)`);
                } else {
                    console.log(`[GetUserDetail] not found — userId="${userId}" — user exists (id="${raw.id}") but findByIdWithRelations returned null (includes query error)`);
                }
                return { error: new UserDataNotFoundError() };
            }
            console.log(`[GetUserDetail] success userId="${userId}"`);
            return { user };
        } catch (err) {
            console.error(`[GetUserDetail] unexpected error — userId="${userId}"`, err);
            throw err;
        }
    }
}
