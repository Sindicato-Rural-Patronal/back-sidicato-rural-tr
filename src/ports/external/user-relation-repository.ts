import type { UserRelation } from '../../generated/prisma/client.js';

export interface UserRelationRepository {
    create(data: {
 sourceId: string;
targetId: string;
label?: string 
}): Promise<UserRelation>;
    findBySourceId(sourceId: string): Promise<UserRelation[]>;
    findById(id: string): Promise<UserRelation | null>;
    delete(id: string): Promise<void>;
}
