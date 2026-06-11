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
    avatar: z.string().nullable().optional(),

    // Identity
    nickname: z.string().nullable().optional(),
    maritalStatus: z
        .enum(['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED', 'DOMESTIC_PARTNERSHIP'])
        .nullable()
        .optional(),
    phone2: z.string().nullable().optional(),
    phone3: z.string().nullable().optional(),

    // Documents
    rg: z.string().nullable().optional(),
    rgIssuer: z.string().nullable().optional(),
    rgIssuedAt: z.string().datetime().nullable().optional(),
    birthDate: z.string().datetime().nullable().optional(),
    driverLicense: z.string().nullable().optional(),
    driverLicenseCategory: z.string().nullable().optional(),

    // Origin
    birthPlace: z.string().nullable().optional(),
    nationality: z.string().nullable().optional(),

    // Profile
    gender: z.enum(['MALE', 'FEMALE', 'OTHER']).nullable().optional(),
    ethnicity: z.enum(['WHITE', 'BLACK', 'MIXED', 'ASIAN', 'INDIGENOUS']).nullable().optional(),
    educationLevel: z
        .enum([
            'NO_FORMAL_EDUCATION',
            'INCOMPLETE_PRIMARY',
            'COMPLETE_PRIMARY',
            'INCOMPLETE_SECONDARY',
            'COMPLETE_SECONDARY',
            'INCOMPLETE_HIGHER',
            'COMPLETE_HIGHER',
            'POSTGRADUATE',
        ])
        .nullable()
        .optional(),
    functionalCategory: z.string().nullable().optional(),
    specialNeeds: z.boolean().optional(),

    // Membership
    memberClassification: z.string().nullable().optional(),
    cadPro: z.string().nullable().optional(),
    familyIncome: z.string().nullable().optional(),
    memberType: z.string().nullable().optional(),
    boardPosition: z.string().nullable().optional(),
    boardMember: z.boolean().optional(),
    memberStatus: z.enum(['ACTIVE', 'INACTIVE']).nullable().optional(),
    memberSince: z.string().datetime().nullable().optional(),
    memberNotes: z.string().nullable().optional(),
    memberNotesNumber: z.string().nullable().optional(),

    // Address
    addressId: z.string().nullable().optional(),
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
