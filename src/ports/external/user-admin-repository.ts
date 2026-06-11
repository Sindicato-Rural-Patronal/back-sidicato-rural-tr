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
}>;

export interface UserAdminRepository {
    findByUsername(username: string): Promise<UserAdminModel | null>;
    findByUserDataId(userDataId: string): Promise<UserAdminModel | null>;
    create(userAdmin: UserAdminUncheckedCreateInput): Promise<UserAdminModel>;
    findById(id: string): Promise<UserAdminModel | null>;
    findAll(skip?: number, take?: number): Promise<UserAdminWithDetails[]>;
    count(): Promise<number>;
    update(id: string, data: UserAdminUpdateInput): Promise<UserAdminModel | null>;
    delete(id: string): Promise<void>;
}
