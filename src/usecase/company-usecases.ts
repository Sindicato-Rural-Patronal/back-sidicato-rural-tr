import type {
    CompanyRepository,
    CompanyModel,
    CompanyDetail,
    CompanyListItem,
    CompanyMemberModel,
    CompanyUpdateInput,
    PartnerItem,
} from '../ports/external/company-repository.js';
import type { UserDataRepository } from '../ports/external/user-data-repository.js';
import type { PropertyRepository } from '../ports/external/property-repository.js';
import type { AddressRepository, AddressCreateInput } from '../ports/external/address-repository.js';
import type { Property } from '../generated/prisma/client.js';
import { ValidationError } from '../errors/validation.js';
import {
    CompanyNotFoundError,
    CompanyMemberNotFoundError,
    PropertyNotFoundError,
    UserDataNotFoundError,
} from '../errors/not-found.js';
import { CompanyCnpjAlreadyExistsError, CompanyMemberAlreadyExistsError } from '../errors/conflict.js';
import { paginate, type PagedResult } from '../lib/pagination.js';
import {
    companySchema,
    companyUpdateSchema,
    memberSchema,
    memberUpdateSchema,
    companyPropertySchema,
    companyListQuerySchema,
    reorderPartnersSchema,
    firstIssue,
    hasAddressValue,
    type CompanyAddressFields,
} from './company-schema.js';

// Casos de uso das empresas. Finos e no mesmo arquivo, como os de convênios.

type Result<T> = { error?: Error } & T;

export class ListCompaniesUseCase {
    constructor(private readonly repo: CompanyRepository) {}
    async execute(query: unknown): Promise<Result<{ result?: PagedResult<CompanyListItem> }>> {
        const parsed = companyListQuerySchema.safeParse(query ?? {});
        if (!parsed.success) return { error: new ValidationError(firstIssue(parsed.error)) };
        const { page, limit, ...filters } = parsed.data;
        const result = await paginate(
            page,
            limit,
            (skip, take) => this.repo.findAll(filters, skip, take),
            () => this.repo.count(filters),
        );
        return { result };
    }
}

export class GetCompanyUseCase {
    constructor(private readonly repo: CompanyRepository) {}
    async execute(id: string): Promise<Result<{ company?: CompanyDetail }>> {
        const company = await this.repo.findDetail(id);
        if (!company) return { error: new CompanyNotFoundError() };
        return { company };
    }
}

// Campos do endereço da sede como o AddressRepository grava (null limpa).
function addressFields(a: CompanyAddressFields) {
    return {
        zipCode: a.zipCode ?? null,
        street: a.street ?? null,
        number: a.number ?? null,
        complement: a.complement ?? null,
        neighborhood: a.neighborhood ?? null,
        city: a.city ?? null,
        state: a.state ?? null,
    };
}

function newAddressInput(a: CompanyAddressFields): AddressCreateInput {
    const filled = Object.entries(addressFields(a)).filter(([, v]) => v != null);
    return { type: 'URBAN',
...Object.fromEntries(filled) };
}

export class CreateCompanyUseCase {
    constructor(
        private readonly repo: CompanyRepository,
        private readonly addresses: AddressRepository,
    ) {}
    async execute(input: unknown, createdBy?: string | null): Promise<Result<{ company?: CompanyModel }>> {
        const parsed = companySchema.safeParse(input);
        if (!parsed.success) return { error: new ValidationError(firstIssue(parsed.error)) };
        // Propriedade principal só existe depois de criar a empresa.
        const { primaryPropertyId: _ignored, address, ...data } = parsed.data;

        if (data.cnpj && (await this.repo.findByCnpj(data.cnpj))) {
            return { error: new CompanyCnpjAlreadyExistsError() };
        }
        const addressId = hasAddressValue(address) ? (await this.addresses.create(newAddressInput(address))).id : null;
        const company = await this.repo.create({ ...data,
addressId,
createdBy: createdBy ?? null });
        return { company };
    }
}

export class UpdateCompanyUseCase {
    constructor(
        private readonly repo: CompanyRepository,
        private readonly addresses: AddressRepository,
    ) {}
    async execute(id: string, input: unknown): Promise<Result<{ company?: CompanyModel }>> {
        const parsed = companyUpdateSchema.safeParse(input);
        if (!parsed.success) return { error: new ValidationError(firstIssue(parsed.error)) };

        const existing = await this.repo.findDetail(id);
        if (!existing) return { error: new CompanyNotFoundError() };

        const { address, ...data } = parsed.data;
        const { cnpj, primaryPropertyId } = data;
        if (cnpj && cnpj !== existing.cnpj) {
            const other = await this.repo.findByCnpj(cnpj);
            if (other && other.id !== id) return { error: new CompanyCnpjAlreadyExistsError() };
        }
        if (primaryPropertyId && !existing.properties.some(p => p.id === primaryPropertyId)) {
            return { error: new ValidationError('A propriedade principal precisa ser desta empresa') };
        }

        // `address` ausente = não mexe; vazio/null = remove; preenchido = cria ou atualiza.
        let removeAddressId: string | null = null;
        const update: CompanyUpdateInput = { ...data };
        if (address !== undefined) {
            if (!hasAddressValue(address)) {
                if (existing.addressId) {
                    update.addressId = null;
                    removeAddressId = existing.addressId;
                }
            } else if (existing.addressId) {
                await this.addresses.update(existing.addressId, addressFields(address));
            } else {
                update.addressId = (await this.addresses.create(newAddressInput(address))).id;
            }
        }
        const company = await this.repo.update(id, update);
        if (removeAddressId) await this.addresses.delete(removeAddressId);
        return { company };
    }
}

export class DeleteCompanyUseCase {
    constructor(private readonly repo: CompanyRepository) {}
    async execute(id: string): Promise<Result<object>> {
        if (!(await this.repo.findById(id))) return { error: new CompanyNotFoundError() };
        await this.repo.softDelete(id);
        return {};
    }
}

// ── Pessoas vinculadas ───────────────────────────────────────────────────────

export class AddCompanyMemberUseCase {
    constructor(
        private readonly repo: CompanyRepository,
        private readonly people: UserDataRepository,
    ) {}
    async execute(companyId: string, input: unknown): Promise<Result<{ member?: CompanyMemberModel }>> {
        const parsed = memberSchema.safeParse(input);
        if (!parsed.success) return { error: new ValidationError(firstIssue(parsed.error)) };

        if (!(await this.repo.findById(companyId))) return { error: new CompanyNotFoundError() };
        if (!(await this.people.findById(parsed.data.userDataId))) return { error: new UserDataNotFoundError() };
        if (await this.repo.findMemberByPerson(companyId, parsed.data.userDataId)) {
            return { error: new CompanyMemberAlreadyExistsError() };
        }
        const member = await this.repo.addMember({ companyId,
...parsed.data });
        return { member };
    }
}

export class UpdateCompanyMemberUseCase {
    constructor(private readonly repo: CompanyRepository) {}
    async execute(companyId: string, memberId: string, input: unknown): Promise<Result<{ member?: CompanyMemberModel }>> {
        const parsed = memberUpdateSchema.safeParse(input);
        if (!parsed.success) return { error: new ValidationError(firstIssue(parsed.error)) };
        const existing = await this.repo.findMember(memberId);
        if (!existing || existing.companyId !== companyId) return { error: new CompanyMemberNotFoundError() };
        const member = await this.repo.updateMemberTitle(memberId, parsed.data.title);
        return { member };
    }
}

export class RemoveCompanyMemberUseCase {
    constructor(private readonly repo: CompanyRepository) {}
    async execute(companyId: string, memberId: string): Promise<Result<object>> {
        const existing = await this.repo.findMember(memberId);
        if (!existing || existing.companyId !== companyId) return { error: new CompanyMemberNotFoundError() };
        await this.repo.removeMember(memberId);
        return {};
    }
}

export class ListMemberTitlesUseCase {
    constructor(private readonly repo: CompanyRepository) {}
    execute(): Promise<string[]> {
        return this.repo.listTitles();
    }
}

// ── Propriedades / endereços da empresa ──────────────────────────────────────

export class AddCompanyPropertyUseCase {
    constructor(
        private readonly repo: CompanyRepository,
        private readonly properties: PropertyRepository,
        private readonly addresses: AddressRepository,
    ) {}
    async execute(companyId: string, input: unknown): Promise<Result<{ property?: Property }>> {
        const parsed = companyPropertySchema.safeParse(input);
        if (!parsed.success) return { error: new ValidationError(firstIssue(parsed.error)) };
        const company = await this.repo.findById(companyId);
        if (!company) return { error: new CompanyNotFoundError() };

        const { name, registration, address } = parsed.data;
        const createdAddress = await this.addresses.create({ ...address,
type: address.type ?? 'URBAN' });
        const property = await this.properties.create({
            companyId,
            name,
            registration: registration ?? undefined,
            addressId: createdAddress.id,
        });
        // Primeiro endereço da empresa vira o principal automaticamente.
        if (!company.primaryPropertyId) await this.repo.update(companyId, { primaryPropertyId: property.id });
        return { property };
    }
}

export class RemoveCompanyPropertyUseCase {
    constructor(
        private readonly repo: CompanyRepository,
        private readonly properties: PropertyRepository,
    ) {}
    async execute(companyId: string, propertyId: string): Promise<Result<object>> {
        const company = await this.repo.findById(companyId);
        if (!company) return { error: new CompanyNotFoundError() };
        const property = await this.properties.findById(propertyId);
        if (!property || property.companyId !== companyId) return { error: new PropertyNotFoundError() };
        await this.properties.delete(propertyId);
        if (company.primaryPropertyId === propertyId) await this.repo.update(companyId, { primaryPropertyId: null });
        return {};
    }
}

// ── Parceiros (públicos) ─────────────────────────────────────────────────────

export class ListPartnersUseCase {
    constructor(private readonly repo: CompanyRepository) {}
    async execute(): Promise<{ partners: PartnerItem[] }> {
        return { partners: await this.repo.findPartners() };
    }
}

export class ReorderPartnersUseCase {
    constructor(private readonly repo: CompanyRepository) {}
    async execute(input: unknown): Promise<Result<object>> {
        const parsed = reorderPartnersSchema.safeParse(input);
        if (!parsed.success) return { error: new ValidationError(firstIssue(parsed.error)) };
        const partners = await this.repo.findPartners();
        const partnerIds = new Set(partners.map(p => p.id));
        const order = parsed.data.order;
        if (order.length !== partnerIds.size || order.some(id => !partnerIds.has(id))) {
            return { error: new ValidationError('A ordem precisa ter todas as empresas parceiras ativas, uma vez cada') };
        }
        await this.repo.reorderPartners(order);
        return {};
    }
}
