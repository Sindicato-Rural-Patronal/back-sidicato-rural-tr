import type { FastifyRequest, FastifyReply } from 'fastify';
import type { UpdateUserDataUseCase } from '../../usecase/update-user-data.js';

export class UpdateUserController {
    constructor(private readonly useCase: UpdateUserDataUseCase) {}

    async handle(
        request: FastifyRequest<{ Params: { id: string }; Body: { name?: string; email?: string; phone?: string; cpf?: string | null; cnpj?: string | null } }>,
        reply: FastifyReply,
    ) {
        const token = request.headers['authorization']?.replace('Bearer ', '') ?? '';
        const { id } = request.params;
        const body = request.body;

        const result = await this.useCase.execute({ ...body, userId: id, token });
        if (!result.success) {
            return reply.status(result.statusCode ?? 400).send({ error: result.error?.message });
        }
        return reply.status(200).send({ message: 'User updated successfully' });
    }
}
