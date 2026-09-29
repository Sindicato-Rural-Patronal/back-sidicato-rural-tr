import type { PrismaClient } from '../../generated/prisma/client.js';
import type { PropertyRepository, PropertyWithAddress } from '../../ports/external/property-repository.js';
import type { Property } from '../../generated/prisma/client.js';
import type {
    PropertyUncheckedCreateInput,
    PropertyUncheckedUpdateInput,
} from '../../generated/prisma/models/Property.js';

export function createPropertyAdapter(prisma: PrismaClient): PropertyRepository {
    return new PropertyAdapter(prisma);
}

export class PropertyAdapter implements PropertyRepository {
    constructor(private prisma: PrismaClient) {}

    create(data: {
        userDataId?: string;
        companyId?: string;
        name: string;
        registration?: string;
        addressId?: string;
    }): Promise<Property> {
        // O `data` traz os ids das relacoes soltos (userDataId/companyId), que
        // no Prisma pertencem a variante "Unchecked" do input. O TypeScript nao
        // escolhe o ramo da uniao sozinho a partir de um objeto com campos
        // opcionais, dai a anotacao — que continua conferindo campo a campo.
        return this.prisma.property.create({ data: data as PropertyUncheckedCreateInput });
    }

    update(
        id: string,
        data: {
 name?: string;
registration?: string | null;
addressId?: string 
},
    ): Promise<PropertyWithAddress> {
        // Campos undefined são ignorados pelo Prisma: só muda o que veio.
        return this.prisma.property.update({
            where: { id },
            data: data as PropertyUncheckedUpdateInput,
            include: { address: true },
        }) as Promise<PropertyWithAddress>;
    }

    findByUserDataId(userDataId: string, skip?: number, take?: number): Promise<PropertyWithAddress[]> {
        return this.prisma.property.findMany({
            where: { userDataId,
isDeleted: false },
            include: { address: true },
            skip,
            take,
        }) as Promise<PropertyWithAddress[]>;
    }

    countByUserDataId(userDataId: string): Promise<number> {
        return this.prisma.property.count({ where: { userDataId,
isDeleted: false } });
    }

    findById(id: string): Promise<Property | null> {
        return this.prisma.property.findFirst({ where: { id,
isDeleted: false } });
    }

    async delete(id: string): Promise<void> {
        await this.prisma.property.update({
            where: { id },
            data: { isDeleted: true,
deletedAt: new Date() },
        });
    }
}
