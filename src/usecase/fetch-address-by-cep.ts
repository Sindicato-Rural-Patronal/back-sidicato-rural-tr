import type { AddressRepository } from '../ports/external/address-repository.js';
import type { Address } from '../generated/prisma/client.js';
import { AddressNotFoundError } from '../errors/not-found.js';

type ViaCepResponse = {
    erro?: boolean;
    cep?: string;
    logradouro?: string;
    bairro?: string;
    localidade?: string;
    uf?: string;
};

type FetchAddressByCepResponse = {
    error?: Error;
    address?: Address;
};

export class FetchAddressByCepUseCase {
    constructor(private readonly addressRepository: AddressRepository) {}

    async execute(cep: string): Promise<FetchAddressByCepResponse> {
        const cepClean = cep.replace(/\D/g, '');
        console.log(`[FetchAddressByCep] cep="${cepClean}"`);

        const existing = await this.addressRepository.findByCep(cepClean);
        if (existing) {
            console.log(`[FetchAddressByCep] found in DB id="${existing.id}"`);
            return { address: existing };
        }

        const res = await fetch(`https://viacep.com.br/ws/${cepClean}/json/`);
        if (!res.ok) return { error: new AddressNotFoundError() };

        const data: ViaCepResponse = await res.json();
        if (data.erro) return { error: new AddressNotFoundError() };

        const address = await this.addressRepository.create({
            type: 'URBAN',
            zipCode: cepClean,
            street: data.logradouro || undefined,
            neighborhood: data.bairro || undefined,
            city: data.localidade || undefined,
            state: data.uf || undefined,
        });
        console.log(`[FetchAddressByCep] fetched from ViaCEP, saved id="${address.id}"`);
        return { address };
    }
}
