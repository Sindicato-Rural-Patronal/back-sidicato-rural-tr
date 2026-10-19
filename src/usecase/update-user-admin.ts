import { z } from 'zod';
import { hash } from 'bcrypt';
import type { UserAdminRepository } from '../ports/external/user-admin-repository.js';
import type { RuleRepository } from '../ports/external/rule-repository.js';
import { ValidationError } from '../errors/validation.js';
import { ForbiddenError } from '../errors/auth.js';
import { AdminNotFoundError, RuleNotFoundError } from '../errors/not-found.js';
import { UsernameAlreadyExistsError } from '../errors/conflict.js';
import { exceedsActor, permissionsOfAdmin } from './admin-guards.js';

const updateUserAdminSchema = z.object({
    username: z.string().trim().min(1, 'Informe o usuário').optional(),
    password: z.string().min(8).optional(),
    rulesId: z.string().uuid().optional(),
});

export type UpdateUserAdminRequest = z.infer<typeof updateUserAdminSchema> & {targetAdminId: string;};

type UpdateUserAdminResponse = { error?: Error };

export class UpdateUserAdminUseCase {
    constructor(
        private readonly userAdminRepository: UserAdminRepository,
        private readonly ruleRepository: RuleRepository,
    ) {}

    async execute(request: UpdateUserAdminRequest, actorPermissions: string[] = []): Promise<UpdateUserAdminResponse> {
        const { targetAdminId, ...body } = request;
        const validation = updateUserAdminSchema.safeParse(body);
        if (!validation.success) {
            return {
                error: new ValidationError(validation.error.issues.map(e => e.message).join(', ')),
            };
        }

        const existing = await this.userAdminRepository.findById(targetAdminId);
        if (!existing) return { error: new AdminNotFoundError() };

        // Anti-escalonamento sobre o ALVO, como na exclusão: quem pede não mexe
        // (senha, usuário, regra) em admin com permissões além das suas. Sem
        // isso, quem tinha UPDATE_USER_ADMIN trocava a senha do super admin e
        // entrava como ele.
        const targetPermissions = await permissionsOfAdmin(this.ruleRepository, existing);
        if (exceedsActor(targetPermissions, actorPermissions)) {
            return { error: new ForbiddenError('Você não pode alterar um administrador com permissões além das suas.') };
        }

        const data = validation.data;

        if (data.username) {
            const conflict = await this.userAdminRepository.findByUsername(data.username);
            if (conflict && conflict.id !== targetAdminId) {
                return { error: new UsernameAlreadyExistsError() };
            }
        }

        if (data.rulesId) {
            const rule = await this.ruleRepository.findById(data.rulesId);
            if (!rule) return { error: new RuleNotFoundError() };
            // Anti-escalonamento: não atribuir uma regra com permissões além das do ator.
            if (exceedsActor(rule.permissions as string[], actorPermissions)) {
                return { error: new ForbiddenError('Você não pode atribuir uma regra com permissões além das suas.') };
            }
        }

        const updatePayload: {
            username?: string;
            passwordHash?: string;
            rulesId?: string;
        } = {};
        if (data.username) updatePayload.username = data.username;
        if (data.rulesId) updatePayload.rulesId = data.rulesId;
        if (data.password) updatePayload.passwordHash = await hash(data.password, 10);

        const updated = await this.userAdminRepository.update(targetAdminId, updatePayload);
        if (!updated) return { error: new Error('Failed to update admin') };

        return {};
    }
}
