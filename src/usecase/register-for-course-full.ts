import { z } from 'zod';
import type { CourseRepository } from '../ports/external/course-repository.js';
import type { UserDataRepository } from '../ports/external/user-data-repository.js';
import type { RegistrationRepository } from '../ports/external/registration-repository.js';
import type { PropertyRepository } from '../ports/external/property-repository.js';
import type {
    AddressRepository,
    AddressCreateInput,
} from '../ports/external/address-repository.js';
import { ValidationError } from '../errors/validation.js';
import { CourseNotFoundError } from '../errors/not-found.js';
import { CourseRegistrationAlreadyExistsError } from '../errors/conflict.js';
import { RegistrationsUnavailableError } from '../errors/business-rule.js';
import { isValidCpf } from '../lib/cpf.js';

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
 */
export class RegisterForCourseFullUseCase {
    constructor(
        private readonly courseRepository: CourseRepository,
        private readonly userDataRepository: UserDataRepository,
        private readonly registrationRepository: RegistrationRepository,
        private readonly propertyRepository: PropertyRepository,
        private readonly addressRepository: AddressRepository,
    ) {}

    async execute(request: Request): Promise<Response> {
        const parsed = schema.safeParse(request);
        if (!parsed.success) {
            return { error: new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid data') };
        }
        const { courseId, name, phone, email, cpf, rg, birthDate, address } = parsed.data;

        if (!isValidCpf(cpf)) {
            return { error: new ValidationError('CPF inválido') };
        }

        const course = await this.courseRepository.findById(courseId);
        if (!course) return { error: new CourseNotFoundError() };
        if (course.status === 'UNPUBLISHED') return { error: new RegistrationsUnavailableError() };

        let userData = await this.userDataRepository.findByEmailOrCpf(email, cpf);

        if (!userData) {
            userData = await this.userDataRepository.create({
                name,
                phone,
                email,
                cpf,
                rg: rg || null,
                birthDate: birthDate ?? null,
            });
            if (!userData) return { error: new Error('Failed to create user record') };

            // endereço → propriedade principal (ignora o `type`, que tem default)
            const hasAddress = address
                ? Object.entries(address).some(([k, v]) => k !== 'type' && v && String(v).trim())
                : false;
            if (address && hasAddress) {
                const addressData: AddressCreateInput = { ...address,
type: address.type ?? 'URBAN' };
                const createdAddress = await this.addressRepository.create(addressData);
                const property = await this.propertyRepository.create({
                    userDataId: userData.id,
                    name: 'Principal',
                    addressId: createdAddress.id,
                });
                await this.userDataRepository.update(userData.id, { primaryPropertyId: property.id });
            }
        }

        const existing = await this.registrationRepository.findByUserDataAndCourse(
            userData.id,
            courseId,
        );
        if (existing) return { error: new CourseRegistrationAlreadyExistsError() };

        const registration = await this.registrationRepository.create(courseId, userData.id);
        return { registrationId: registration.id,
userDataId: userData.id };
    }
}
