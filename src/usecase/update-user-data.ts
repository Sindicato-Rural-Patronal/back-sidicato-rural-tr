import { z } from 'zod';
import type { UserDataRepository } from '../ports/external/user-data-repository.js';
import { ValidationError } from '../errors/validation.js';
import { UserNotFoundError } from '../errors/not-found.js';
import { EmailOrCpfAlreadyInUseError, RgAlreadyInUseError } from '../errors/conflict.js';
import { isValidCpf } from '../lib/cpf.js';
import { isValidCnpj } from '../lib/cnpj.js';
import { isValidBrPhone, isValidRg, isValidCnh } from '../lib/br-validators.js';

const updateUserDataSchema = z.object({
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
    phone: z.string().refine(v => isValidBrPhone(v), 'Telefone inválido (DDD + 8 ou 9 dígitos)').optional(),
    cpf: z.string().refine(v => isValidCpf(v), 'CPF inválido').nullable().optional(),
    cnpj: z.string().refine(v => isValidCnpj(v), 'CNPJ inválido').nullable().optional(),
    avatar: z.string().nullable().optional(),

    // Identity
    nickname: z.string().nullable().optional(),
    maritalStatus: z.enum(['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED', 'DOMESTIC_PARTNERSHIP']).nullable().optional(),
    phone2: z.string().refine(v => isValidBrPhone(v), 'Telefone 2 inválido (DDD + 8 ou 9 dígitos)').nullable().optional(),
    phone3: z.string().refine(v => isValidBrPhone(v), 'Telefone 3 inválido (DDD + 8 ou 9 dígitos)').nullable().optional(),

    // Documents
    rg: z.string().refine(v => isValidRg(v), 'RG inválido (7 a 9 dígitos)').nullable().optional(),
    rgIssuer: z.string().nullable().optional(),
    rgIssuedAt: z.coerce.date().nullable().optional(),
    birthDate: z.coerce.date().nullable().optional(),
    driverLicense: z.string().refine(v => isValidCnh(v), 'CNH inválida (11 dígitos)').nullable().optional(),
    driverLicenseCategory: z.string().nullable().optional(),

    // Origin
    birthPlace: z.string().nullable().optional(),
    nationality: z.string().nullable().optional(),

    // Profile
    gender: z.enum(['MALE', 'FEMALE', 'OTHER']).nullable().optional(),
    ethnicity: z.enum(['WHITE', 'BLACK', 'MIXED', 'ASIAN', 'INDIGENOUS']).nullable().optional(),
    educationLevel: z.enum(['NO_FORMAL_EDUCATION','INCOMPLETE_PRIMARY','COMPLETE_PRIMARY','INCOMPLETE_SECONDARY','COMPLETE_SECONDARY','INCOMPLETE_HIGHER','COMPLETE_HIGHER','POSTGRADUATE',]).nullable().optional(),
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
    memberSince: z.coerce.date().nullable().optional(),
    memberNotes: z.string().nullable().optional(),
    memberNotesNumber: z.string().nullable().optional(),

    // Partner
    isPartner: z.boolean().optional(),
    partnerUrl: z.string().url().max(500).nullable().optional(),
    partnerOrder: z.number().int().min(0).nullable().optional(),
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

        if (data.cpf) {
            const conflict = await this.userDataRepository.findByCpf(data.cpf);
            if (conflict && conflict.id !== userId) {
                return { error: new EmailOrCpfAlreadyInUseError() };
            }
        }
        if (data.rg) {
            const conflict = await this.userDataRepository.findByRg(data.rg);
            if (conflict && conflict.id !== userId) {
                return { error: new RgAlreadyInUseError() };
            }
        }

        const updated = await this.userDataRepository.update(userId, data);
        if (!updated) return { error: new Error('Failed to update user') };

        console.log(`[UpdateUserData] success userId="${userId}"`);
        return {};
    }
}
