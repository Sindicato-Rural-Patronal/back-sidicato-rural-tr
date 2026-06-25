import type { UserDataRepository } from '../ports/external/user-data-repository.js';
import { UserAlreadyExistsError } from '../errors/conflict.js';
import { ValidationError } from '../errors/validation.js';
import { isValidCpf } from '../lib/cpf.js';
import { isValidBrPhone } from '../lib/br-validators.js';

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
        if (!isValidCpf(request.cpf)) {
            return { error: new ValidationError('CPF inválido') };
        }
        if (!isValidBrPhone(request.phone)) {
            return { error: new ValidationError('Telefone inválido (DDD + 8 ou 9 dígitos)') };
        }

        const existingUser = await this.userDataRepository.findByCpf(request.cpf);
        if (existingUser) {
            console.log(`[CreateUser] conflict: CPF already registered cpf="${request.cpf}"`);
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
