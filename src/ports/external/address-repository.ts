import type { Address } from '../../generated/prisma/client.js';

export type AddressCreateInput = {
    type: 'URBAN' | 'RURAL';
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

export interface AddressRepository {
    create(data: AddressCreateInput): Promise<Address>;
    /** `null` limpa o campo. */
    update(id: string, data: { [K in keyof AddressCreateInput]?: AddressCreateInput[K] | null }): Promise<Address | null>;
    findById(id: string): Promise<Address | null>;
    findByCep(zipCode: string): Promise<Address | null>;
    delete(id: string): Promise<void>;
}
