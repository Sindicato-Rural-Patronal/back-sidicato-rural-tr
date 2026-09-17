import { z } from 'zod';
import { hash } from 'bcrypt';
import type { UserAdminRepository } from '../ports/external/user-admin-repository.js';
import type { UserDataRepository } from '../ports/external/user-data-repository.js';
import { ValidationError } from '../errors/validation.js';
import { AdminNotFoundError } from '../errors/not-found.js';
import { UsernameAlreadyExistsError } from '../errors/conflict.js';

const schema = z.object({
    name: z.string().min(1).optional(),
    username: z.string().min(3, 'Usuário deve ter ao menos 3 caracteres').optional(),
    password: z.string().min(8, 'A senha deve ter ao menos 8 caracteres').optional(),
});

// Self-service: o admin logado edita os PRÓPRIOS dados. Sem perm de gestão —
// só precisa estar autenticado (o adminId vem do token).
export class UpdateMeUseCase {
    constructor(
        private readonly userAdminRepo: UserAdminRepository,
        private readonly userDataRepo: UserDataRepository,
    ) {}

    async execute(adminId: string, input: unknown): Promise<{ error?: Error }> {
        const parsed = schema.safeParse(input);
        if (!parsed.success) {
            return { error: new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos') };
        }
        const admin = await this.userAdminRepo.findById(adminId);
        if (!admin) return { error: new AdminNotFoundError() };

        const d = parsed.data;

        if (d.username) {
            const conflict = await this.userAdminRepo.findByUsername(d.username);
            if (conflict && conflict.id !== adminId) return { error: new UsernameAlreadyExistsError() };
        }

        const adminPayload: {
 username?: string;
passwordHash?: string 
} = {};
        if (d.username) adminPayload.username = d.username;
        if (d.password) adminPayload.passwordHash = await hash(d.password, 10);
        if (Object.keys(adminPayload).length > 0) {
            await this.userAdminRepo.update(adminId, adminPayload);
        }
        if (d.name) {
            await this.userDataRepo.update(admin.userDataId, { name: d.name });
        }
        return {};
    }
}
