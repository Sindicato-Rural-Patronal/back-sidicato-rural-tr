import type { FastifyRequest, FastifyReply } from 'fastify';
import type { CreateUserUseCase } from '../../usecase/create-user-data';

export class CreateUserController {
    constructor(private createUserUseCase: CreateUserUseCase) { }

    async handle(request: FastifyRequest, reply: FastifyReply) {
        const { name, email, phone, cpf } = request.body as { name: string; email: string; phone: string; cpf: string };
        const response = await this.createUserUseCase.execute({ name, email, phone, cpf });
        if (response.Error) {
            if (response.Error.message === 'User already exists') {
                return reply.status(409).send({ error: response.Error.message });
            }
            return reply.status(500).send({ error: response.Error.message });
        }
        return reply.status(201).send({
            id: response.id,
            name: response.name,
            email: response.email,
            phone: response.phone,
            cpf: response.cpf,
            createdAt: response.createdAt,
        });
    }
}