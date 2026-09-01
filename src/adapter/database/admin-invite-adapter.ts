import type { PrismaClient } from '@prisma/client/extension';
import type { AdminInviteModel } from '../../generated/prisma/models/AdminInvite.js';
import type { AdminInviteRepository } from '../../ports/external/admin-invite-repository.js';

export function createAdminInviteAdapter(prisma: PrismaClient): AdminInviteRepository {
    return new AdminInviteAdapter(prisma);
}

class AdminInviteAdapter implements AdminInviteRepository {
    constructor(private prisma: PrismaClient) {}

    create(data: {
        token: string;
        userDataId: string;
        rulesId: string;
        expiresAt: Date;
    }): Promise<AdminInviteModel> {
        return this.prisma.adminInvite.create({ data });
    }

    findByToken(token: string): Promise<AdminInviteModel | null> {
        return this.prisma.adminInvite.findUnique({ where: { token } });
    }

    async markUsed(id: string): Promise<void> {
        await this.prisma.adminInvite.update({ where: { id },
data: { usedAt: new Date() } });
    }
}
