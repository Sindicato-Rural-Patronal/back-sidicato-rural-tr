import { z } from 'zod';
import type { PropertyRepository, PropertyWithAddress } from '../ports/external/property-repository.js';
import type { AddressRepository, AddressCreateInput } from '../ports/external/address-repository.js';
import { PropertyNotFoundError } from '../errors/not-found.js';
import { ValidationError } from '../errors/validation.js';
import { firstIssue } from './company-schema.js';

// Edição de propriedade/endereço, da pessoa ou da empresa. Campo ausente não
// muda nada; corrigir um erro de digitação não exige mais excluir e recadastrar.
// A propriedade principal (`primaryPropertyId`) continua onde está.

const emptyToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);

/** Texto opcional: vazio vira null (limpa o campo). */
const text = (max: number) =>
    z.preprocess(emptyToNull, z.string().trim().max(max, `Máximo de ${max} caracteres`).nullable().optional());

export const propertyUpdateSchema = z.object({
    name: z.string().trim().min(1, 'Informe o nome da propriedade/endereço').max(120).optional(),
    registration: text(60),
    address: z
        .object({
            type: z.enum(['URBAN', 'RURAL']).optional(),
            city: text(120),
            state: text(2),
            zipCode: text(9),
            complement: text(160),
            notes: text(500),
            street: text(160),
            number: text(20),
            neighborhood: text(120),
            localityName: text(120),
            road: text(120),
            km: text(20),
            lot: text(40),
            section: text(40),
        })
        .optional(),
});

export type PropertyUpdateInput = z.infer<typeof propertyUpdateSchema>;

/** Dona da propriedade: uma pessoa OU uma empresa (nunca as duas). */
export type PropertyOwner = { userDataId: string } | { companyId: string };

type UpdatePropertyResponse = {
    error?: Error;
    property?: PropertyWithAddress;
};

/** Tira nulos/indefinidos: o create do endereço não aceita null. */
function filled(address: NonNullable<PropertyUpdateInput['address']>): AddressCreateInput {
    const entries = Object.entries(address).filter(([, v]) => v != null && v !== '');
    return { type: address.type ?? 'URBAN',
...Object.fromEntries(entries) } as AddressCreateInput;
}

export class UpdatePropertyUseCase {
    constructor(
        private readonly propertyRepository: PropertyRepository,
        private readonly addressRepository: AddressRepository,
    ) {}

    async execute(
        propertyId: string,
        owner: PropertyOwner,
        input: unknown,
    ): Promise<UpdatePropertyResponse> {
        const parsed = propertyUpdateSchema.safeParse(input ?? {});
        if (!parsed.success) return { error: new ValidationError(firstIssue(parsed.error)) };

        const existing = await this.propertyRepository.findById(propertyId);
        // Propriedade de outro dono responde 404, como se não existisse.
        const belongs =
            'userDataId' in owner
                ? existing?.userDataId === owner.userDataId
                : existing?.companyId === owner.companyId;
        if (!existing || !belongs) return { error: new PropertyNotFoundError() };

        const { name, registration, address } = parsed.data;

        let addressId: string | undefined;
        if (address && Object.keys(address).length > 0) {
            if (existing.addressId) {
                await this.addressRepository.update(existing.addressId, address);
            } else {
                addressId = (await this.addressRepository.create(filled(address))).id;
            }
        }

        const property = await this.propertyRepository.update(propertyId, { name,
registration,
addressId });
        return { property };
    }
}
