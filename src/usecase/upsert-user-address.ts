import type { UserDataRepository } from '../ports/external/user-data-repository.js';
import type {
    AddressRepository,
    AddressCreateInput,
} from '../ports/external/address-repository.js';
import { UserDataNotFoundError } from '../errors/not-found.js';

export type UpsertUserAddressRequest = {
    userId: string;
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

type UpsertUserAddressResponse = {
 error?: Error;
addressId?: string 
};

export class UpsertUserAddressUseCase {
    constructor(
        private readonly userDataRepository: UserDataRepository,
        private readonly addressRepository: AddressRepository,
    ) {}

    async execute(request: UpsertUserAddressRequest): Promise<UpsertUserAddressResponse> {
        const { userId, type = 'URBAN', ...addressFields } = request;
        console.log(`[UpsertUserAddress] userId="${userId}"`);

        const user = await this.userDataRepository.findById(userId);
        if (!user) return { error: new UserDataNotFoundError() };

        const addressData: AddressCreateInput = { type,
...addressFields };

        if (user.addressId) {
            const updated = await this.addressRepository.update(user.addressId, addressData);
            if (!updated) return { error: new Error('Failed to update address') };
            console.log(`[UpsertUserAddress] updated addressId="${user.addressId}"`);
            return { addressId: user.addressId };
        } else {
            const created = await this.addressRepository.create(addressData);
            await this.userDataRepository.update(userId, { addressId: created.id });
            console.log(`[UpsertUserAddress] created addressId="${created.id}"`);
            return { addressId: created.id };
        }
    }
}
