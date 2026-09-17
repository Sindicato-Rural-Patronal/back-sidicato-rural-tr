import type { UserDataRepository } from '../ports/external/user-data-repository.js';
import { CpfAlreadyInUseError } from '../errors/conflict.js';
import { ValidationError } from '../errors/validation.js';
import { isValidCpf } from '../lib/cpf.js';
import { isValidBrPhone } from '../lib/br-validators.js';
import { personEmailSchema } from '../lib/person-email.js';

type CreateUserRequest = {
    name: string;
    // Opcional: vazio = sem e-mail. Pode repetir entre pessoas (só o CPF não).
    email?: string | null;
    phone: string;
    cpf: string;
};

type CreateUserResponse = {
    error?: Error;
    data?: {
        id: string;
        name: string;
        email: string | null;
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
        const email = personEmailSchema.safeParse(request.email);
        if (!email.success) {
            return { error: new ValidationError('E-mail inválido') };
        }

        const existingUser = await this.userDataRepository.findByCpf(request.cpf);
        if (existingUser) {
            return { error: new CpfAlreadyInUseError() };
        }

        const newUser = await this.userDataRepository.create({
            name: request.name,
            email: email.data ?? null,
            phone: request.phone,
            cpf: request.cpf,
        });

        if (!newUser) {
            return { error: new Error('Failed to create user') };
        }

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
