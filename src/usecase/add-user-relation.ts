import type { UserDataRepository } from '../ports/external/user-data-repository.js';
import type { UserRelationRepository } from '../ports/external/user-relation-repository.js';
import type { UserRelation } from '../generated/prisma/client.js';
import { UserDataNotFoundError } from '../errors/not-found.js';
import { ValidationError } from '../errors/validation.js';

type AddUserRelationResponse = {
    error?: Error;
    relation?: UserRelation;
};

export class AddUserRelationUseCase {
    constructor(
        private readonly userDataRepository: UserDataRepository,
        private readonly userRelationRepository: UserRelationRepository,
    ) {}

    async execute(
        sourceId: string,
        targetId: string,
        label?: string,
    ): Promise<AddUserRelationResponse> {
        if (sourceId === targetId) {
            return { error: new ValidationError('A member cannot be related to themselves') };
        }

        console.log(`[AddUserRelation] sourceId="${sourceId}" targetId="${targetId}"`);

        const source = await this.userDataRepository.findById(sourceId);
        if (!source) return { error: new UserDataNotFoundError() };

        const target = await this.userDataRepository.findById(targetId);
        if (!target) return { error: new UserDataNotFoundError() };

        const relation = await this.userRelationRepository.create({ sourceId,
targetId,
label });
        console.log(`[AddUserRelation] created relationId="${relation.id}"`);

        const inverseExists = await this.userRelationRepository.findBySourceAndTarget(targetId, sourceId);
        if (!inverseExists) {
            await this.userRelationRepository.create({ sourceId: targetId,
targetId: sourceId });
            console.log(`[AddUserRelation] created inverse relation ${targetId}→${sourceId}`);
        }

        return { relation };
    }
}
