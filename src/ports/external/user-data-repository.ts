import type {
    UserDataModel,
    UserDataUncheckedCreateInput,
} from '../../generated/prisma/models/UserData.js';
import type { AddressModel } from '../../generated/prisma/models/Address.js';
import type { UserRelation } from '../../generated/prisma/client.js';
import type { Property } from '../../generated/prisma/client.js';

export type UserDataUpdateInput = Partial<{
    name: string;
    email: string;
    phone: string;
    cpf: string | null;
    cnpj: string | null;
    avatar: string | null;

    // Identity
    nickname: string | null;
    maritalStatus: string | null;
    phone2: string | null;
    phone3: string | null;

    // Documents
    rg: string | null;
    rgIssuer: string | null;
    rgIssuedAt: Date | string | null;
    birthDate: Date | string | null;
    driverLicense: string | null;
    driverLicenseCategory: string | null;

    // Origin
    birthPlace: string | null;
    nationality: string | null;

    // Profile
    gender: string | null;
    ethnicity: string | null;
    educationLevel: string | null;
    functionalCategory: string | null;
    specialNeeds: boolean;

    // Membership
    memberClassification: string | null;
    cadPro: string | null;
    familyIncome: string | null;
    memberType: string | null;
    boardPosition: string | null;
    boardMember: boolean;
    memberStatus: string | null;
    memberSince: Date | string | null;
    memberNotes: string | null;
    memberNotesNumber: string | null;

    // Address
    addressId: string | null;
}>;

export type UserDataWithRelations = UserDataModel & {
    address: AddressModel | null;
    relations: (UserRelation & {
target: {
 id: string;
name: string;
cpf: string | null 
};
})[];
    properties: (Property & {address: AddressModel | null;})[];
};

export interface UserDataRepository {
    create(data: UserDataUncheckedCreateInput): Promise<UserDataModel | null>;
    findByEmailOurPhone(email: string, phone: string): Promise<UserDataModel | null>;
    findById(id: string): Promise<UserDataModel | null>;
    findByIdWithRelations(id: string): Promise<UserDataWithRelations | null>;
    findAll(skip?: number, take?: number): Promise<UserDataModel[]>;
    count(): Promise<number>;
    findByEmailOrCpf(email: string, cpf: string): Promise<UserDataModel | null>;
    update(id: string, data: UserDataUpdateInput): Promise<UserDataModel | null>;
    delete(id: string): Promise<void>;
}
