import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ListUsersUseCase } from '../../usecase/list-users.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { requirePermission } from '../lib/require-permission.js';
import type { UserListFilters } from '../../ports/external/user-data-repository.js';

export class ListUsersController {
    constructor(
        private readonly useCase: ListUsersUseCase,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    async handle(request: FastifyRequest, reply: FastifyReply) {
        if (
            (await requirePermission(request, reply, 'READ_USER', this.getAdminPermissions)) ===
            null
        )
            return;
        // Genero, etnia e escolaridade sao colunas enum no banco. O schema da
        // rota (user-data-router.ts) ja recusa valor fora da lista antes de
        // chegar aqui, entao a query pode ser lida com os tipos do enum.
        const q = request.query as Record<string, string> & Pick<UserListFilters, 'gender' | 'ethnicity' | 'educationLevel'>;
        const page = Math.max(1, Number(q.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
        // Fastify coage a query (schema type: 'boolean') para boolean real,
        // mas mantemos aceite de string por robustez.
        const rawIncomplete: unknown = (request.query as Record<string, unknown>).incompleteRegistration;
        const incompleteRegistration =
            rawIncomplete === true || rawIncomplete === 'true' ? true :
            rawIncomplete === false || rawIncomplete === 'false' ? false : undefined;
        const rawActive: unknown = (request.query as Record<string, unknown>).activeMember;
        const activeMember = rawActive === true || rawActive === 'true' ? true : undefined;
        const filters = {
            search: q.search || undefined,
            memberType: q.memberType || undefined,
            memberClassification: q.memberClassification || undefined,
            gender: q.gender || undefined,
            ethnicity: q.ethnicity || undefined,
            educationLevel: q.educationLevel || undefined,
            incompleteRegistration,
            activeMember,
        };
        const response = await this.useCase.execute(page, limit, filters);
        if (response.error) return reply.status(400).send({ error: response.error?.message });
        return reply.status(200).send(response.result);
    }
}
