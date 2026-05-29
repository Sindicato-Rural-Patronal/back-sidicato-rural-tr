import type { UserDataRepository } from "../ports/external/user-data-repository.js";


type CreateUserRequest = {
    name: string;
    email: string;
    phone: string;
    cpf: string;
}
type CreateUserResponse = {
    id: string;
    name: string;
    email: string;
    phone: string;
    cpf: string;
    createdAt: Date;

    Error?: Error;
}

export class CreateUserUseCase {
        constructor(private userDataRepository: UserDataRepository) {}

        async execute(request: CreateUserRequest): Promise<CreateUserResponse> {
            const existingUser = await this.userDataRepository.findByEmailOurPhone(request.email, request.phone);
            if (existingUser) {
              return{
                id: "", 
                name: "",   
                email: "",  
                phone: "",
                cpf: "",
                createdAt: new Date(),
                Error: new Error('User already exists')
              }
            }
            const newUser = await this.userDataRepository.create({
                name: request.name,
                email: request.email,
                phone: request.phone,
                cpf: request.cpf,
            });
            if (!newUser) {
                return {
                    id: "",
                    name: "",
                    email: "",  
                    phone: "",
                    cpf: "",
                    createdAt: new Date(),
                    Error: new Error('Failed to create user')
                }
            }
            return {
                id: newUser.id,
                name: newUser.name,
                email: newUser.email,
                phone: newUser.phone,
                cpf: newUser.cpf ?? '',
                createdAt: newUser.createdAt
            };
        }


}