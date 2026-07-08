import type { UserDataRepository } from '../ports/external/user-data-repository.js';
import { UserNotFoundError } from '../errors/not-found.js';

type DeleteUserDataResponse = { error?: Error };

export class DeleteUserDataUseCase {
    constructor(private readonly userDataRepository: UserDataRepository) {}

    async execute(userId: string): Promise<DeleteUserDataResponse> {
        const existing = await this.userDataRepository.findById(userId);
        if (!existing) {
            return { error: new UserNotFoundError() };
        }

        await this.userDataRepository.delete(userId);
        return {};
    }
}
