import { z } from 'zod';
import type { PrismaClient } from '@prisma/client/extension';
import type { AddressCreateInput } from '../ports/external/address-repository.js';
import { createCourseAdapter } from '../adapter/database/course-adapter.js';
import { createUserDataAdapter } from '../adapter/database/user-data.js';
import { createAddressAdapter } from '../adapter/database/address-adapter.js';
import { createPropertyAdapter } from '../adapter/database/property-adapter.js';
import { createRegistrationAdapter } from '../adapter/database/registration-adapter.js';
import { ValidationError } from '../errors/validation.js';
import { CourseNotFoundError } from '../errors/not-found.js';
import {
    CourseRegistrationAlreadyExistsError,
    DuplicateUserContactError,
} from '../errors/conflict.js';
import { isValidCpf } from '../lib/cpf.js';
import { checkCourseAcceptsRegistration } from '../lib/course-registration-rules.js';
import { isPrismaUniqueViolation, uniqueViolationFields } from '../lib/prisma-errors.js';
import { sendRegistrationConfirmation } from '../lib/mailer.js';

const schema = z.object({
    courseId: z.string().min(1),
    name: z.string().min(1),
    phone: z.string().min(1),
    email: z.string().email(),
    cpf: z.string().min(1),
    rg: z.string().optional(),
    birthDate: z.coerce.date().optional(),
    address: z
        .object({
            type: z.enum(['URBAN', 'RURAL']).optional(),
            zipCode: z.string().optional(),
            street: z.string().optional(),
            number: z.string().optional(),
            neighborhood: z.string().optional(),
            city: z.string().optional(),
            state: z.string().optional(),
            road: z.string().optional(),
            km: z.string().optional(),
        })
        .optional(),
});

type Request = z.input<typeof schema>;
type Response = {
 error?: Error;
registrationId?: string;
userDataId?: string
};

/**
 * Inscrição pública completa: cria o participante com os dados da ficha simples
 * (rg, nascimento) e registra o endereço como propriedade principal, depois
 * inscreve no curso. Se já existir alguém com o mesmo email/CPF, apenas inscreve.
 *
 * Toda a criação (user → endereço → propriedade → primaryProperty → inscrição)
 * roda numa transação: falha no meio não deixa registros órfãos.
 */
export class RegisterForCourseFullUseCase {
    constructor(private readonly prisma: PrismaClient) {}

    async execute(request: Request): Promise<Response> {
        const parsed = schema.safeParse(request);
        if (!parsed.success) {
            return { error: new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid data') };
        }
        const { courseId, name, phone, email, cpf, rg, birthDate, address } = parsed.data;

        if (!isValidCpf(cpf)) {
            return { error: new ValidationError('CPF inválido') };
        }

        const courseRepository = createCourseAdapter(this.prisma);
        const userDataRepository = createUserDataAdapter(this.prisma);

        const course = await courseRepository.findById(courseId);
        if (!course) return { error: new CourseNotFoundError() };
        const closed = checkCourseAcceptsRegistration(course);
        if (closed) return { error: closed };

        const existingUser = await userDataRepository.findByEmailOrCpf(email, cpf);

        const hasAddress = address
            ? Object.entries(address).some(([k, v]) => k !== 'type' && v && String(v).trim())
            : false;

        try {
            const result = await this.prisma.$transaction(async (tx: unknown) => {
                const t = tx as PrismaClient;
                const userRepo = createUserDataAdapter(t);
                const addressRepo = createAddressAdapter(t);
                const propertyRepo = createPropertyAdapter(t);
                const registrationRepo = createRegistrationAdapter(t);

                let userData = existingUser;
                if (!userData) {
                    userData = await userRepo.create({
                        name,
                        phone,
                        email,
                        cpf,
                        rg: rg || null,
                        birthDate: birthDate ?? null,
                    });
                    if (!userData) throw new Error('Failed to create user record');

                    // endereço → propriedade principal (ignora o `type`, que tem default)
                    if (address && hasAddress) {
                        const addressData: AddressCreateInput = {
                            ...address,
                            type: address.type ?? 'URBAN',
                        };
                        const createdAddress = await addressRepo.create(addressData);
                        const property = await propertyRepo.create({
                            userDataId: userData.id,
                            name: 'Principal',
                            addressId: createdAddress.id,
                        });
                        await userRepo.update(userData.id, { primaryPropertyId: property.id });
                    }
                }

                const existing = await registrationRepo.findByUserDataAndCourse(userData.id, courseId);
                if (existing) throw new CourseRegistrationAlreadyExistsError();

                const registration = await registrationRepo.create(courseId, userData.id);
                return { registrationId: registration.id,
userDataId: userData.id };
            });
            sendRegistrationConfirmation(email, name, course.name);
            return result;
        } catch (e) {
            if (e instanceof CourseRegistrationAlreadyExistsError) return { error: e };
            const fields = uniqueViolationFields(e);
            const isRegistrationDup = fields.some(
                f => f.includes('courseId') || f.includes('userDataId') || f.includes('active'),
            );
            if (isRegistrationDup) return { error: new CourseRegistrationAlreadyExistsError() };
            // Outra violação de unicidade = e-mail/telefone/CPF de outro usuário.
            if (isPrismaUniqueViolation(e)) return { error: new DuplicateUserContactError() };
            return { error: e instanceof Error ? e : new Error('Registration failed') };
        }
    }
}
