import type { PrismaClient } from '@prisma/client/extension';
import type {
    PublicContactRepository,
    PublicContactModel,
    PublicContactWithPerson,
} from '../../ports/external/public-contact-repository.js';

export function createPublicContactAdapter(prisma: PrismaClient): PublicContactRepository {
    return new PublicContactAdapter(prisma);
}

class PublicContactAdapter implements PublicContactRepository {
    constructor(private prisma: PrismaClient) {}

    list(): Promise<PublicContactWithPerson[]> {
        return this.prisma.publicContact.findMany({
            where: { userData: { isDeleted: false } },
            include: { userData: { select: { id: true,
name: true,
email: true,
phone: true,
avatar: true } } },
            orderBy: [{ order: 'asc' },
{ createdAt: 'asc' }],
        });
    }

    findById(id: string): Promise<PublicContactModel | null> {
        return this.prisma.publicContact.findUnique({ where: { id } });
    }

    findByPerson(userDataId: string): Promise<PublicContactModel | null> {
        return this.prisma.publicContact.findUnique({ where: { userDataId } });
    }

    count(): Promise<number> {
        return this.prisma.publicContact.count();
    }

    create(data: {
 userDataId: string;
title: string | null;
order: number 
}): Promise<PublicContactModel> {
        return this.prisma.publicContact.create({ data });
    }

    updateTitle(id: string, title: string | null): Promise<PublicContactModel> {
        return this.prisma.publicContact.update({ where: { id },
data: { title } });
    }

    async delete(id: string): Promise<void> {
        await this.prisma.publicContact.delete({ where: { id } });
    }

    async reorder(ids: string[]): Promise<void> {
        await this.prisma.$transaction(
            ids.map((id, order) => this.prisma.publicContact.update({ where: { id },
data: { order } })),
        );
    }
}
