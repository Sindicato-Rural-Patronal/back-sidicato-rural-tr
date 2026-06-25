import type { UserRelationRepository } from '../ports/external/user-relation-repository.js';
import { UserRelationNotFoundError } from '../errors/not-found.js';

type DeleteUserRelationResponse = { error?: Error };

export class DeleteUserRelationUseCase {
    constructor(private readonly userRelationRepository: UserRelationRepository) {}

    async execute(relationId: string, userId: string): Promise<DeleteUserRelationResponse> {
        console.log(`[DeleteUserRelation] relationId="${relationId}" userId="${userId}"`);
        const existing = await this.userRelationRepository.findById(relationId);
        if (!existing) return { error: new UserRelationNotFoundError() };
        if (existing.sourceId !== userId) return { error: new UserRelationNotFoundError() };
        await this.userRelationRepository.delete(relationId);
        console.log(`[DeleteUserRelation] success relationId="${relationId}"`);

        const inverse = await this.userRelationRepository.findBySourceAndTarget(
            existing.targetId,
            existing.sourceId,
        );
        if (inverse) {
            await this.userRelationRepository.delete(inverse.id);
            console.log(`[DeleteUserRelation] deleted inverse relationId="${inverse.id}"`);
        }

        return {};
    }
}
