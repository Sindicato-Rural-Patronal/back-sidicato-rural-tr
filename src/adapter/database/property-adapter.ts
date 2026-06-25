import type { PrismaClient } from '@prisma/client/extension';
import type { PropertyRepository, PropertyWithAddress } from '../../ports/external/property-repository.js';
import type { Property } from '../../generated/prisma/client.js';

export function createPropertyAdapter(prisma: PrismaClient): PropertyRepository {
    return new PropertyAdapter(prisma);
}

export class PropertyAdapter implements PropertyRepository {
    constructor(private prisma: PrismaClient) {}

    create(data: {
        userDataId: string;
        name: string;
        registration?: string;
        addressId?: string;
    }): Promise<Property> {
        return this.prisma.property.create({ data });
    }

    findByUserDataId(userDataId: string, skip?: number, take?: number): Promise<PropertyWithAddress[]> {
        return this.prisma.property.findMany({
            where: { userDataId, isDeleted: false },
            include: { address: true },
            skip,
            take,
        }) as Promise<PropertyWithAddress[]>;
    }

    countByUserDataId(userDataId: string): Promise<number> {
        return this.prisma.property.count({ where: { userDataId, isDeleted: false } });
    }

    findById(id: string): Promise<Property | null> {
        return this.prisma.property.findFirst({ where: { id, isDeleted: false } });
    }

    async delete(id: string): Promise<void> {
        await this.prisma.property.update({
            where: { id },
            data: { isDeleted: true, deletedAt: new Date() },
        });
    }
}
