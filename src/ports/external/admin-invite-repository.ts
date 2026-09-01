import type { AdminInviteModel } from '../../generated/prisma/models/AdminInvite.js';

export type { AdminInviteModel };

export interface AdminInviteRepository {
    create(data: {
        token: string;
        userDataId: string;
        rulesId: string;
        expiresAt: Date;
    }): Promise<AdminInviteModel>;
    findByToken(token: string): Promise<AdminInviteModel | null>;
    markUsed(id: string): Promise<void>;
}
