import type { UserAdminRepository } from '../ports/external/user-admin-repository.js';
import { AdminNotFoundError } from '../errors/not-found.js';

type DeleteUserAdminResponse = { error?: Error };

export class DeleteUserAdminUseCase {
    constructor(private readonly userAdminRepository: UserAdminRepository) {}

    async execute(targetAdminId: string): Promise<DeleteUserAdminResponse> {
        console.log(`[DeleteUserAdmin] targetAdminId="${targetAdminId}"`);
        const existing = await this.userAdminRepository.findById(targetAdminId);
        if (!existing) {
            console.log(`[DeleteUserAdmin] admin not found: ${targetAdminId}`);
            return { error: new AdminNotFoundError() };
        }

        await this.userAdminRepository.delete(targetAdminId);
        console.log(`[DeleteUserAdmin] success targetAdminId="${targetAdminId}"`);
        return {};
    }
}
