import type { FastifyRequest, FastifyReply } from 'fastify';
import type { UpdateUserAdminUseCase } from '../../usecase/update-user-admin.js';

export class UpdateUserAdminController {
    constructor(private readonly useCase: UpdateUserAdminUseCase) {}

    async handle(
        request: FastifyRequest<{ Params: { id: string }; Body: { username?: string; password?: string; rulesId?: string } }>,
        reply: FastifyReply,
    ) {
        const token = request.headers['authorization']?.replace('Bearer ', '') ?? '';
        const { id } = request.params;
        const body = request.body;

        const result = await this.useCase.execute({ ...body, targetAdminId: id, token });
        if (!result.success) {
            return reply.status(result.statusCode ?? 400).send({ error: result.error?.message });
        }
        return reply.status(200).send({ message: 'Admin updated successfully' });
    }
}
