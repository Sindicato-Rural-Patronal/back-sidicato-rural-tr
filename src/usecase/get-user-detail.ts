import type {
    UserDataRepository,
    UserDataWithRelations,
} from '../ports/external/user-data-repository.js';
import { UserDataNotFoundError } from '../errors/not-found.js';

type GetUserDetailResponse = {
 error?: Error;
user?: UserDataWithRelations 
};

export class GetUserDetailUseCase {
    constructor(private readonly userDataRepository: UserDataRepository) {}

    async execute(userId: string): Promise<GetUserDetailResponse> {
        console.log(`[GetUserDetail] userId="${userId}"`);
        const user = await this.userDataRepository.findByIdWithRelations(userId);
        if (!user) return { error: new UserDataNotFoundError() };
        console.log(`[GetUserDetail] success userId="${userId}"`);
        return { user };
    }
}
