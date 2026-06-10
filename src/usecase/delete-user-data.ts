import type { UserDataRepository } from '../ports/external/user-data-repository.js';
import { UserNotFoundError } from '../errors/not-found.js';

type DeleteUserDataResponse = {error?: Error;};

export class DeleteUserDataUseCase {
    constructor(private readonly userDataRepository: UserDataRepository) {}

    async execute(userId: string): Promise<DeleteUserDataResponse> {
        console.log(`[DeleteUserData] userId="${userId}"`);
        const existing = await this.userDataRepository.findById(userId);
        if (!existing) {
            console.log(`[DeleteUserData] user not found: ${userId}`);
            return { error: new UserNotFoundError() };
        }

        await this.userDataRepository.delete(userId);
        console.log(`[DeleteUserData] success userId="${userId}"`);
        return {};
    }
}
