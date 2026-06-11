import { z } from 'zod';
import type { UserDataRepository } from '../ports/external/user-data-repository.js';
import { ValidationError } from '../errors/validation.js';
import { UserNotFoundError } from '../errors/not-found.js';
import { EmailOrCpfAlreadyInUseError } from '../errors/conflict.js';

const updateUserDataSchema = z.object({
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
    phone: z.string().min(1).optional(),
    cpf: z.string().nullable().optional(),
    cnpj: z.string().nullable().optional(),
});

export type UpdateUserDataRequest = z.infer<typeof updateUserDataSchema> & { userId: string };

type UpdateUserDataResponse = { error?: Error };

export class UpdateUserDataUseCase {
    constructor(private readonly userDataRepository: UserDataRepository) {}

    async execute(request: UpdateUserDataRequest): Promise<UpdateUserDataResponse> {
        console.log(`[UpdateUserData] userId="${request.userId}"`);
        const { userId, ...body } = request;
        const validation = updateUserDataSchema.safeParse(body);
        if (!validation.success) {
            return {
                error: new ValidationError(validation.error.issues.map(e => e.message).join(', ')),
            };
        }

        const existing = await this.userDataRepository.findById(userId);
        if (!existing) return { error: new UserNotFoundError() };

        const data = validation.data;

        if (data.email || data.cpf) {
            const conflict = await this.userDataRepository.findByEmailOrCpf(
                data.email ?? existing.email,
                data.cpf ?? existing.cpf ?? '',
            );
            if (conflict && conflict.id !== userId) {
                return { error: new EmailOrCpfAlreadyInUseError() };
            }
        }

        const updated = await this.userDataRepository.update(userId, data);
        if (!updated) return { error: new Error('Failed to update user') };

        console.log(`[UpdateUserData] success userId="${userId}"`);
        return {};
    }
}
