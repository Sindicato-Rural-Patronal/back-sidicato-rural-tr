import {UserAdminModel,UserAdminUncheckedCreateInput} from "../../generated/prisma/models/UserAdmin.js"

export type UserAdminWithDetails = UserAdminModel & {
    userData: { name: string; email: string; cpf: string | null };
    rules: { name: string; permitions: string[] };
};

export interface UserAdminRepository {
    findByUsername(username: string): Promise<UserAdminModel | null>;
    findByUserDataId(userDataId: string): Promise<UserAdminModel | null>;
    create(userAdmin: UserAdminUncheckedCreateInput): Promise<UserAdminModel>;
    findById(id: string): Promise<UserAdminModel | null>;
    findAll(): Promise<UserAdminWithDetails[]>;
}