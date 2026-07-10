import type { UserAdminRepository } from '../ports/external/user-admin-repository.js';
import { AdminNotFoundError } from '../errors/not-found.js';

type DeleteUserAdminResponse = { error?: Error };

export class DeleteUserAdminUseCase {
    constructor(private readonly userAdminRepository: UserAdminRepository) {}

    async execute(targetAdminId: string): Promise<DeleteUserAdminResponse> {
        const existing = await this.userAdminRepository.findById(targetAdminId);
        if (!existing) {
            return { error: new AdminNotFoundError() };
        }

        await this.userAdminRepository.delete(targetAdminId);
        return {};
    }
}
