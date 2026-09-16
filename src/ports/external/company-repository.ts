import type { CompanyModel } from '../../generated/prisma/models/Company.js';
import type { CompanyMemberModel } from '../../generated/prisma/models/CompanyMember.js';
import type { CompanyType } from '../../generated/prisma/enums.js';
import type { PropertyWithAddress } from './property-repository.js';

export type { CompanyModel, CompanyMemberModel, CompanyType };

export type CompanyListFilters = {
    search?: string;
    type?: CompanyType;
    isPartner?: boolean;
};

export type CompanyListItem = CompanyModel & { membersCount: number };

/** Pessoa vinculada, com o essencial pra listar e abrir o cadastro. */
export type CompanyMemberWithPerson = CompanyMemberModel & {
userData: {
 id: string;
name: string;
cpf: string | null;
phone: string;
email: string 
};
};

export type CompanyDetail = CompanyModel & {
    members: CompanyMemberWithPerson[];
    properties: PropertyWithAddress[];
};

export type CompanyInput = {
    name: string;
    cnpj?: string | null;
    stateRegistration?: string | null;
    type?: CompanyType;
    phone?: string | null;
    phone2?: string | null;
    phone3?: string | null;
    email?: string | null;
    website?: string | null;
    notes?: string | null;
    isPartner?: boolean;
    partnerUrl?: string | null;
    partnerOrder?: number | null;
    primaryPropertyId?: string | null;
};

export type CompanyUpdateInput = Partial<CompanyInput> & { partnerLogo?: string | null };

/** Formato do GET /partners público (mantido igual ao de antes da separação). */
export type PartnerItem = {
    id: string;
    name: string;
    avatarUrl: string | null;
    partnerLogoUrl: string | null;
    partnerUrl: string | null;
    cnpj: string | null;
};

export interface CompanyRepository {
    findAll(filters: CompanyListFilters, skip: number, take: number): Promise<CompanyListItem[]>;
    count(filters: CompanyListFilters): Promise<number>;
    /** Só empresas ativas. */
    findById(id: string): Promise<CompanyModel | null>;
    findDetail(id: string): Promise<CompanyDetail | null>;
    /** Empresa ativa com esse CNPJ (só dígitos). */
    findByCnpj(cnpjDigits: string): Promise<CompanyModel | null>;
    create(data: CompanyInput & { createdBy?: string | null }): Promise<CompanyModel>;
    update(id: string, data: CompanyUpdateInput): Promise<CompanyModel>;
    softDelete(id: string): Promise<void>;

    findMember(memberId: string): Promise<CompanyMemberModel | null>;
    findMemberByPerson(companyId: string, userDataId: string): Promise<CompanyMemberModel | null>;
    addMember(data: {
 companyId: string;
userDataId: string;
title: string 
}): Promise<CompanyMemberModel>;
    updateMemberTitle(memberId: string, title: string): Promise<CompanyMemberModel>;
    removeMember(memberId: string): Promise<void>;
    /** Títulos já usados em qualquer empresa — sugestões no formulário. */
    listTitles(): Promise<string[]>;

    findPartners(): Promise<PartnerItem[]>;
    reorderPartners(companyIds: string[]): Promise<void>;
}
