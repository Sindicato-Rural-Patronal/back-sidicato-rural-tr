import type { UserRelation } from '../../generated/prisma/client.js';

export type UserRelationWithTarget = UserRelation & {
target: {
 id: string;
name: string;
cpf: string | null 
};
};

export interface UserRelationRepository {
    create(data: {
 sourceId: string;
targetId: string;
label?: string 
}): Promise<UserRelation>;
    findBySourceId(sourceId: string, skip?: number, take?: number): Promise<UserRelationWithTarget[]>;
    countBySourceId(sourceId: string): Promise<number>;
    findById(id: string): Promise<UserRelation | null>;
    findBySourceAndTarget(sourceId: string, targetId: string): Promise<UserRelation | null>;
    delete(id: string): Promise<void>;
}
