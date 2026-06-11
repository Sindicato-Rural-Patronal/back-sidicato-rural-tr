import type { PrismaClient } from '@prisma/client/extension';
import type { PropertyRepository } from '../../ports/external/property-repository.js';
import type { PropertyModel as Property } from '../../generated/prisma/models/Property.js';

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

    findByUserDataId(userDataId: string): Promise<Property[]> {
        return this.prisma.property.findMany({ where: { userDataId } });
    }

    findById(id: string): Promise<Property | null> {
        return this.prisma.property.findUnique({ where: { id } });
    }

    async delete(id: string): Promise<void> {
        await this.prisma.property.delete({ where: { id } });
    }
}
