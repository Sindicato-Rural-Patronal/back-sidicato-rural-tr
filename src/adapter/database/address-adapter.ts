import type { PrismaClient } from '../../generated/prisma/client.js';
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

    // Campo vazio vai como null para limpar o que estava gravado — menos o
    // `type`, que e NOT NULL no banco (urbano ou rural, sempre um dos dois).
    update(
        id: string,
        data: {
            [K in keyof AddressCreateInput]?: K extends 'type'
                ? AddressCreateInput[K]
                : AddressCreateInput[K] | null
        },
    ): Promise<Address | null> {
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
