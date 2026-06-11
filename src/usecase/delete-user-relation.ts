import type { UserRelationRepository } from '../ports/external/user-relation-repository.js';
import { UserRelationNotFoundError } from '../errors/not-found.js';

type DeleteUserRelationResponse = { error?: Error };

export class DeleteUserRelationUseCase {
    constructor(private readonly userRelationRepository: UserRelationRepository) {}

    async execute(relationId: string): Promise<DeleteUserRelationResponse> {
        console.log(`[DeleteUserRelation] relationId="${relationId}"`);
        const existing = await this.userRelationRepository.findById(relationId);
        if (!existing) return { error: new UserRelationNotFoundError() };
        await this.userRelationRepository.delete(relationId);
        console.log(`[DeleteUserRelation] success relationId="${relationId}"`);
        return {};
    }
}
