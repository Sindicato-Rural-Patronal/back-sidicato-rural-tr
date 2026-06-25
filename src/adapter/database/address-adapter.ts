import type { PrismaClient } from '@prisma/client/extension';
import type {
    AddressRepository,
    AddressCreateInput,
} from '../../ports/external/address-repository.js';
import type { AddressModel as Address } from '../../generated/prisma/models/Address.js';

export function createAddressAdapter(prisma: PrismaClient): AddressRepository {
    return new AddressAdapter(prisma);
}

export class AddressAdapter implements AddressRepository {
    constructor(private prisma: PrismaClient) {}

    create(data: AddressCreateInput): Promise<Address> {
        return this.prisma.address.create({ data });
    }

    update(id: string, data: Partial<AddressCreateInput>): Promise<Address | null> {
        return this.prisma.address.update({ where: { id },
data });
    }

    findById(id: string): Promise<Address | null> {
        return this.prisma.address.findUnique({ where: { id } });
    }

    findByCep(zipCode: string): Promise<Address | null> {
        return this.prisma.address.findFirst({ where: { zipCode } });
    }

    async delete(id: string): Promise<void> {
        await this.prisma.address.delete({ where: { id } });
    }
}
