import type { UserDataRepository } from '../ports/external/user-data-repository.js';
import type { PropertyRepository } from '../ports/external/property-repository.js';
import type {
    AddressRepository,
    AddressCreateInput,
} from '../ports/external/address-repository.js';
import type { Property } from '../generated/prisma/client.js';
import { UserDataNotFoundError } from '../errors/not-found.js';
import { ValidationError } from '../errors/validation.js';

export type AddPropertyRequest = {
    userDataId: string;
    name: string;
    registration?: string;
    address: {
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
    property?: Property;
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

        if (!name.trim()) return { error: new ValidationError('Property name is required') };
        if (!address) return { error: new ValidationError('Address is required') };

        const user = await this.userDataRepository.findById(userDataId);
        if (!user) return { error: new UserDataNotFoundError() };

        const addressData: AddressCreateInput = { type: address.type ?? 'URBAN', ...address };
        const createdAddress = await this.addressRepository.create(addressData);

        const property = await this.propertyRepository.create({
            userDataId,
            name,
            registration,
            addressId: createdAddress.id,
        });
        console.log(`[AddProperty] created propertyId="${property.id}"`);
        return { property };
    }
}
