import {UserDataModel, UserDataUncheckedCreateInput} from "../../generated/prisma/models/UserData.js"
export interface  UserDataRepository {
    create(data: UserDataUncheckedCreateInput): Promise<UserDataModel  | null>;
    findByEmailOurPhone(email: string, phone: string): Promise<UserDataModel | null>;
    findById(id: string): Promise<UserDataModel | null>;
    findAll(): Promise<UserDataModel[]>;
    findByEmailOrCpf(email: string, cpf: string): Promise<UserDataModel | null>;
}