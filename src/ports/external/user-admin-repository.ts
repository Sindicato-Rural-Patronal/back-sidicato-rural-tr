import type {
    UserAdminModel,
    UserAdminUncheckedCreateInput,
} from '../../generated/prisma/models/UserAdmin.js';

export type UserAdminWithDetails = UserAdminModel & {
    userData: {
        name: string;
        email: string;
        cpf: string | null;
    };
    rules: {
        name: string;
        permissions: string[];
    };
};

export type UserAdminUpdateInput = Partial<{
    username: string;
    passwordHash: string;
    rulesId: string;
    isPublic: boolean;
    publicTitle: string | null;
}>;

export type PublicContactItem = {
    publicTitle: string | null;
    userData: {
 name: string;
email: string;
phone: string 
};
};

export type UserAdminListFilters = {
    search?: string;
    rulesId?: string;
    isPublic?: boolean;
};

export interface UserAdminRepository {
    findByUsername(username: string): Promise<UserAdminModel | null>;
    findByUserDataId(userDataId: string): Promise<UserAdminModel | null>;
    create(userAdmin: UserAdminUncheckedCreateInput): Promise<UserAdminModel>;
    findById(id: string): Promise<UserAdminModel | null>;
    findAll(filters?: UserAdminListFilters, skip?: number, take?: number): Promise<UserAdminWithDetails[]>;
    count(filters?: UserAdminListFilters): Promise<number>;
    update(id: string, data: UserAdminUpdateInput): Promise<UserAdminModel | null>;
    delete(id: string): Promise<void>;
    findAllPublic(): Promise<PublicContactItem[]>;
}
