import type { UserDataRepository } from '../ports/external/user-data-repository.js';
import { UserAlreadyExistsError } from '../errors/conflict.js';

type CreateUserRequest = {
    name: string;
    email: string;
    phone: string;
    cpf: string;
};

type CreateUserResponse = {
    error?: Error;
    data?: {
        id: string;
        name: string;
        email: string;
        phone: string;
        cpf: string;
        createdAt: Date;
    };
};

export class CreateUserUseCase {
    constructor(private userDataRepository: UserDataRepository) {}

    async execute(request: CreateUserRequest): Promise<CreateUserResponse> {
        console.log(`[CreateUser] email="${request.email}" phone="${request.phone}"`);
        const existingUser = await this.userDataRepository.findByEmailOurPhone(
            request.email,
            request.phone,
        );
        if (existingUser) {
            console.log(`[CreateUser] conflict: user already exists email="${request.email}"`);
            return { error: new UserAlreadyExistsError() };
        }

        const newUser = await this.userDataRepository.create({
            name: request.name,
            email: request.email,
            phone: request.phone,
            cpf: request.cpf,
        });

        if (!newUser) {
            return { error: new Error('Failed to create user') };
        }

        console.log(`[CreateUser] success userId="${newUser.id}"`);
        return {
            data: {
                id: newUser.id,
                name: newUser.name,
                email: newUser.email,
                phone: newUser.phone,
                cpf: newUser.cpf ?? '',
                createdAt: newUser.createdAt,
            },
        };
    }
}
