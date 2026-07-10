import { z } from 'zod';
import { hash } from 'bcrypt';
import type { UserAdminRepository } from '../ports/external/user-admin-repository.js';
import type { RuleRepository } from '../ports/external/rule-repository.js';
import { ValidationError } from '../errors/validation.js';
import { AdminNotFoundError, RuleNotFoundError } from '../errors/not-found.js';
import { UsernameAlreadyExistsError } from '../errors/conflict.js';

const updateUserAdminSchema = z.object({
    username: z.string().min(1).optional(),
    password: z.string().min(6).optional(),
    rulesId: z.string().uuid().optional(),
    isPublic: z.boolean().optional(),
    publicTitle: z.string().nullable().optional(),
});

export type UpdateUserAdminRequest = z.infer<typeof updateUserAdminSchema> & {targetAdminId: string;};

type UpdateUserAdminResponse = { error?: Error };

export class UpdateUserAdminUseCase {
    constructor(
        private readonly userAdminRepository: UserAdminRepository,
        private readonly ruleRepository: RuleRepository,
    ) {}

    async execute(request: UpdateUserAdminRequest): Promise<UpdateUserAdminResponse> {
        const { targetAdminId, ...body } = request;
        const validation = updateUserAdminSchema.safeParse(body);
        if (!validation.success) {
            return {
                error: new ValidationError(validation.error.issues.map(e => e.message).join(', ')),
            };
        }

        const existing = await this.userAdminRepository.findById(targetAdminId);
        if (!existing) return { error: new AdminNotFoundError() };

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
        }

        const updatePayload: {
            username?: string;
            passwordHash?: string;
            rulesId?: string;
            isPublic?: boolean;
            publicTitle?: string | null;
        } = {};
        if (data.username) updatePayload.username = data.username;
        if (data.rulesId) updatePayload.rulesId = data.rulesId;
        if (data.password) updatePayload.passwordHash = await hash(data.password, 10);
        if (data.isPublic !== undefined) updatePayload.isPublic = data.isPublic;
        if (data.publicTitle !== undefined) updatePayload.publicTitle = data.publicTitle;

        const updated = await this.userAdminRepository.update(targetAdminId, updatePayload);
        if (!updated) return { error: new Error('Failed to update admin') };

        return {};
    }
}
