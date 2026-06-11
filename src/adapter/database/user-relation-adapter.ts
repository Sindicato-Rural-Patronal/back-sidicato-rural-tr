import type { PrismaClient } from '@prisma/client/extension';
import type { UserRelationRepository } from '../../ports/external/user-relation-repository.js';
import type { UserRelationModel as UserRelation } from '../../generated/prisma/models/UserRelation.js';

export function createUserRelationAdapter(prisma: PrismaClient): UserRelationRepository {
    return new UserRelationAdapter(prisma);
}

export class UserRelationAdapter implements UserRelationRepository {
    constructor(private prisma: PrismaClient) {}

    create(data: {
 sourceId: string;
targetId: string;
label?: string 
}): Promise<UserRelation> {
        return this.prisma.userRelation.create({ data });
    }

    findBySourceId(sourceId: string): Promise<UserRelation[]> {
        return this.prisma.userRelation.findMany({ where: { sourceId } });
    }

    findById(id: string): Promise<UserRelation | null> {
        return this.prisma.userRelation.findUnique({ where: { id } });
    }

    async delete(id: string): Promise<void> {
        await this.prisma.userRelation.delete({ where: { id } });
    }
}
