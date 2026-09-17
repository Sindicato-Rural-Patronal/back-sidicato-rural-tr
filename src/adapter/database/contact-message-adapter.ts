import type { PrismaClient } from '@prisma/client/extension';
import { buildContactMessageWhere } from './list-filters.js';
import type {
    ContactMessageRepository,
    ContactMessageModel,
    ContactMessageCreateInput,
    ContactMessageFilters,
} from '../../ports/external/contact-message-repository.js';

export function createContactMessageAdapter(prisma: PrismaClient): ContactMessageRepository {
    return new ContactMessageAdapter(prisma);
}

class ContactMessageAdapter implements ContactMessageRepository {
    constructor(private prisma: PrismaClient) {}

    create(data: ContactMessageCreateInput): Promise<ContactMessageModel> {
        return this.prisma.contactMessage.create({ data }) as Promise<ContactMessageModel>;
    }

    findAll(skip?: number, take?: number, filters?: ContactMessageFilters): Promise<ContactMessageModel[]> {
        return this.prisma.contactMessage.findMany({
            where: this.buildWhere(filters),
            orderBy: { createdAt: 'desc' },
            skip,
            take,
        }) as Promise<ContactMessageModel[]>;
    }

    count(filters?: ContactMessageFilters): Promise<number> {
        return this.prisma.contactMessage.count({ where: this.buildWhere(filters) });
    }

    private buildWhere(filters?: ContactMessageFilters) {
        return buildContactMessageWhere(filters);
    }

    findById(id: string): Promise<ContactMessageModel | null> {
        return this.prisma.contactMessage.findFirst({
            where: { id,
isDeleted: false },
        }) as Promise<ContactMessageModel | null>;
    }

    setRead(id: string, read: boolean): Promise<ContactMessageModel | null> {
        return this.prisma.contactMessage.update({
            where: { id },
            data: { read },
        }) as Promise<ContactMessageModel | null>;
    }

    async delete(id: string): Promise<void> {
        await this.prisma.contactMessage.update({
            where: { id },
            data: { isDeleted: true,
deletedAt: new Date() },
        });
    }
}
