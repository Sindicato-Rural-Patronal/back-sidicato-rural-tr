import type { FastifyRequest, FastifyReply } from 'fastify';
import type { CreateUserUseCase } from '../../usecase/create-user-data.js';
import { errorToStatus } from '../lib/require-permission.js';

export class CreateUserController {
    constructor(private createUserUseCase: CreateUserUseCase) {}

    async handle(request: FastifyRequest, reply: FastifyReply) {
        const { name, email, phone, cpf } = request.body as {
            name: string;
            email: string;
            phone: string;
            cpf: string;
        };
        const response = await this.createUserUseCase.execute({ name,
email,
phone,
cpf });
        if (response.error) {
            return reply
                .status(errorToStatus(response.error))
                .send({ error: response.error?.message });
        }
        return reply.status(201).send(response.data);
    }
}
