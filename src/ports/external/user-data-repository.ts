import type {
    UserDataModel,
    UserDataUncheckedCreateInput,
} from '../../generated/prisma/models/UserData.js';
import type { AddressModel } from '../../generated/prisma/models/Address.js';
import type { UserRelation } from '../../generated/prisma/client.js';
import type { Property } from '../../generated/prisma/client.js';
// Colunas enum do banco. Tipar como `string` aqui deixava passar qualquer
// texto ate o Prisma, que so reclama em tempo de execucao; os usecases ja
// validam com z.enum, e agora o tipo diz a mesma coisa.
import type {
    Gender,
    MaritalStatus,
    Ethnicity,
    EducationLevel,
    MemberStatus,
} from '../../generated/prisma/client.js';

export type UserDataUpdateInput = Partial<{
    name: string;
    email: string | null;
    phone: string;
    cpf: string | null;
    avatar: string | null;

    // Identity
    nickname: string | null;
    maritalStatus: MaritalStatus | null;
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
    gender: Gender | null;
    ethnicity: Ethnicity | null;
    educationLevel: EducationLevel | null;
    functionalCategory: string | null;
    specialNeeds: boolean;

    // Membership
    memberClassification: string | null;
    cadPro: string[];
    familyIncome: string | null;
    memberType: string | null;
    boardPosition: string | null;
    boardMember: boolean;
    memberStatus: MemberStatus | null;
    memberSince: Date | string | null;
    membershipValidUntil: Date | string | null;
    memberNotes: string | null;
    memberNotesNumber: string | null;

    // Primary property (id de uma Property do próprio usuário)
    primaryPropertyId: string | null;

}>;

export type UserInstructorProfile = {
    id: string;
    bio: string | null;
    linkedin: string | null;
    instagram: string | null;
    facebook: string | null;
};

export type UserDataWithRelations = UserDataModel & {
    relations: (UserRelation & {
        target: {
            id: string;
            name: string;
            cpf: string | null;
        };
    })[];
    properties: (Property & { address: AddressModel | null })[];
    userInstructor: UserInstructorProfile | null;
    companyMemberships: {
        id: string;
        title: string;
        company: {
 id: string;
name: string;
tradeName: string | null;
cnpj: string | null;
type: string;
isPartner: boolean 
};
    }[];
};

export type UserListFilters = {
    search?: string;
    memberType?: string;
    memberClassification?: string;
    gender?: Gender;
    ethnicity?: Ethnicity;
    educationLevel?: EducationLevel;
    incompleteRegistration?: boolean;
    /**
     * So os associados em dia: situacao ATIVO e validade nao vencida (validade
     * em branco conta como em dia). Mesma regra do selo "Associado" da tela.
     */
    activeMember?: boolean;
};

export interface UserDataRepository {
    create(data: UserDataUncheckedCreateInput): Promise<UserDataModel | null>;
    findById(id: string): Promise<UserDataModel | null>;
    findByIdWithRelations(id: string): Promise<UserDataWithRelations | null>;
    findAll(filters?: UserListFilters, skip?: number, take?: number): Promise<UserDataModel[]>;
    count(filters?: UserListFilters): Promise<number>;
    findByCpf(cpf: string): Promise<UserDataModel | null>;
    findByRg(rg: string): Promise<UserDataModel | null>;
    update(id: string, data: UserDataUpdateInput): Promise<UserDataModel | null>;
    delete(id: string): Promise<void>;
}
