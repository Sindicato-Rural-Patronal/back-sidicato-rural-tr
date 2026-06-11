import type { Property } from '../../generated/prisma/client.js';

export interface PropertyRepository {
    create(data: {
        userDataId: string;
        name: string;
        registration?: string;
        addressId?: string;
    }): Promise<Property>;
    findByUserDataId(userDataId: string): Promise<Property[]>;
    findById(id: string): Promise<Property | null>;
    delete(id: string): Promise<void>;
}
