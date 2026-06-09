import type { FastifyRequest, FastifyReply } from 'fastify';
import type { DeleteUserAdminUseCase } from '../../usecase/delete-user-admin.js';

export class DeleteUserAdminController {
    constructor(private readonly useCase: DeleteUserAdminUseCase) {}

    async handle(
        request: FastifyRequest<{ Params: { id: string } }>,
        reply: FastifyReply,
    ) {
        const token = request.headers['authorization']?.replace('Bearer ', '') ?? '';
        const { id } = request.params;

        const result = await this.useCase.execute(id, token);
        if (!result.success) {
            return reply.status(result.statusCode ?? 400).send({ error: result.error?.message });
        }
        return reply.status(204).send();
    }
}
