import type { Property } from '../../generated/prisma/client.js';
import type { AddressModel } from '../../generated/prisma/models/Address.js';

export type PropertyWithAddress = Property & { address: AddressModel | null };

export interface PropertyRepository {
    create(data: {
        userDataId: string;
        name: string;
        registration?: string;
        addressId: string;
    }): Promise<Property>;
    findByUserDataId(userDataId: string, skip?: number, take?: number): Promise<PropertyWithAddress[]>;
    countByUserDataId(userDataId: string): Promise<number>;
    findById(id: string): Promise<Property | null>;
    delete(id: string): Promise<void>;
}
