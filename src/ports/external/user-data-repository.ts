import type {UserDataModel, UserDataUncheckedCreateInput} from "../../generated/prisma/models/UserData.js"

export type UserDataUpdateInput = Partial<{
    name: string;
    email: string;
    phone: string;
    cpf: string | null;
    cnpj: string | null;
}>;

export interface  UserDataRepository {
    create(data: UserDataUncheckedCreateInput): Promise<UserDataModel  | null>;
    findByEmailOurPhone(email: string, phone: string): Promise<UserDataModel | null>;
    findById(id: string): Promise<UserDataModel | null>;
    findAll(skip?: number, take?: number): Promise<UserDataModel[]>;
    count(): Promise<number>;
    findByEmailOrCpf(email: string, cpf: string): Promise<UserDataModel | null>;
    update(id: string, data: UserDataUpdateInput): Promise<UserDataModel | null>;
    delete(id: string): Promise<void>;
}