import type { UserDataRepository } from '../ports/external/user-data-repository.js';
import type { PropertyRepository } from '../ports/external/property-repository.js';
import type {
    AddressRepository,
    AddressCreateInput,
} from '../ports/external/address-repository.js';
import type { Property } from '../generated/prisma/client.js';
import { UserDataNotFoundError } from '../errors/not-found.js';

export type AddPropertyRequest = {
    userDataId: string;
    name: string;
    registration?: string;
    address?: {
        type?: 'URBAN' | 'RURAL';
        city?: string;
        state?: string;
        zipCode?: string;
        complement?: string;
        notes?: string;
        street?: string;
        number?: string;
        neighborhood?: string;
        localityName?: string;
        road?: string;
        km?: string;
        lot?: string;
        section?: string;
    };
};

type AddPropertyResponse = {
 error?: Error;
property?: Property 
};

export class AddPropertyUseCase {
    constructor(
        private readonly userDataRepository: UserDataRepository,
        private readonly propertyRepository: PropertyRepository,
        private readonly addressRepository: AddressRepository,
    ) {}

    async execute(request: AddPropertyRequest): Promise<AddPropertyResponse> {
        const { userDataId, name, registration, address } = request;
        console.log(`[AddProperty] userDataId="${userDataId}" name="${name}"`);

        const user = await this.userDataRepository.findById(userDataId);
        if (!user) return { error: new UserDataNotFoundError() };

        let addressId: string | undefined;
        if (address) {
            const addressData: AddressCreateInput = { type: address.type ?? 'URBAN',
...address };
            const created = await this.addressRepository.create(addressData);
            addressId = created.id;
        }

        const property = await this.propertyRepository.create({
            userDataId,
            name,
            registration,
            addressId,
        });
        console.log(`[AddProperty] created propertyId="${property.id}"`);
        return { property };
    }
}
