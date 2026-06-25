import type { PrismaClient } from '@prisma/client/extension';
import type { UserRelationRepository, UserRelationWithTarget } from '../../ports/external/user-relation-repository.js';
import type { UserRelation } from '../../generated/prisma/client.js';

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

    findBySourceAndTarget(sourceId: string, targetId: string): Promise<UserRelation | null> {
        return this.prisma.userRelation.findFirst({ where: { sourceId,
targetId,
isDeleted: false } });
    }

    findBySourceId(sourceId: string, skip?: number, take?: number): Promise<UserRelationWithTarget[]> {
        return this.prisma.userRelation.findMany({
            where: { sourceId,
isDeleted: false,
target: { isDeleted: false } },
            include: { target: { select: { id: true,
name: true,
cpf: true } } },
            skip,
            take,
        }) as Promise<UserRelationWithTarget[]>;
    }

    countBySourceId(sourceId: string): Promise<number> {
        return this.prisma.userRelation.count({
            where: { sourceId,
isDeleted: false,
target: { isDeleted: false } },
        });
    }

    findById(id: string): Promise<UserRelation | null> {
        return this.prisma.userRelation.findFirst({ where: { id,
isDeleted: false } });
    }

    async delete(id: string): Promise<void> {
        await this.prisma.userRelation.update({
            where: { id },
            data: { isDeleted: true,
deletedAt: new Date() },
        });
    }
}
