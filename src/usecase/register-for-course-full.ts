import { z } from 'zod';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { AddressCreateInput } from '../ports/external/address-repository.js';
import { createCourseAdapter } from '../adapter/database/course-adapter.js';
import { createUserDataAdapter } from '../adapter/database/user-data.js';
import { createAddressAdapter } from '../adapter/database/address-adapter.js';
import { createPropertyAdapter } from '../adapter/database/property-adapter.js';
import { createRegistrationAdapter, lockCourseSeats } from '../adapter/database/registration-adapter.js';
import { ValidationError } from '../errors/validation.js';
import { CourseNotFoundError } from '../errors/not-found.js';
import {
    CourseRegistrationAlreadyExistsError,
    CpfAlreadyInUseError,
} from '../errors/conflict.js';
import { isValidCpf } from '../lib/cpf.js';
import { checkCourseAcceptsRegistration } from '../lib/course-registration-rules.js';
import { CourseFullError } from '../errors/business-rule.js';
import { isPrismaSerializationError, isPrismaUniqueViolation, uniqueViolationFields } from '../lib/prisma-errors.js';
import { personEmailSchema } from '../lib/person-email.js';
import type { NotificationPublisher } from '../ports/external/notification-repository.js';
import { courseRegistrationEvent, publishSafely } from '../lib/notification-events.js';

const schema = z.object({
    courseId: z.string().min(1),
    name: z.string().min(1),
    phone: z.string().min(1),
    // Opcional (vazio = sem e-mail) e pode repetir entre pessoas.
    email: personEmailSchema,
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

/** Tentativas da transação serializável quando o Postgres a derruba por conflito (P2034). */
const MAX_ATTEMPTS = 3;

/**
 * Inscrição pública completa: cria o participante com os dados da ficha simples
 * (rg, nascimento) e registra o endereço como propriedade principal, depois
 * inscreve no curso. Se já existir alguém com o mesmo CPF, apenas inscreve (e-mail e
 * telefone podem repetir entre pessoas e não identificam ninguém).
 *
 * Toda a criação (user → endereço → propriedade → primaryProperty → inscrição)
 * roda numa transação: falha no meio não deixa registros órfãos.
 */
export class RegisterForCourseFullUseCase {
    constructor(
        private readonly prisma: PrismaClient,
        private readonly notifications: NotificationPublisher,
    ) {}

    async execute(request: Request): Promise<Response> {
        const parsed = schema.safeParse(request);
        if (!parsed.success) {
            return { error: new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos.') };
        }
        const { courseId, name, phone, email, cpf, rg, birthDate, address } = parsed.data;

        if (!isValidCpf(cpf)) {
            return { error: new ValidationError('CPF inválido') };
        }

        const courseRepository = createCourseAdapter(this.prisma);

        const course = await courseRepository.findById(courseId);
        if (!course) return { error: new CourseNotFoundError() };
        const closed = checkCourseAcceptsRegistration(course);
        if (closed) return { error: closed };

        const hasAddress = address
            ? Object.entries(address).some(([k, v]) => k !== 'type' && v && String(v).trim())
            : false;

        // As vagas do curso ficam travadas na transação (a mesma trava do
        // createWithCapacity), então inscrições ao mesmo tempo entram uma de cada
        // vez. A nova tentativa sobra para conflito de escrita que ainda apareça
        // (ex.: o mesmo CPF novo se inscrevendo em dois cursos ao mesmo tempo).
        for (let attempt = 1; ; attempt++) {
            try {
                const result = await this.registerOnce({ courseId,
name,
phone,
email,
cpf,
rg,
birthDate,
address,
hasAddress,
maxCapacity: course.room.maxCapacity });
                // Depois do commit: evento de uma inscrição que existe de fato.
                await publishSafely(this.notifications, courseRegistrationEvent({
                    courseId,
                    courseName: course.name,
                    personName: result.personName,
                    registrationId: result.registrationId,
                }));
                return { registrationId: result.registrationId,
userDataId: result.userDataId };
            } catch (e) {
                if (isPrismaSerializationError(e) && attempt < MAX_ATTEMPTS) continue;
                const known = knownRegistrationError(e);
                if (known) return { error: known };
                // Inesperado (banco fora do ar, FK, conflito que sobrou das
                // tentativas): sobe para o apiErrorHandler, que loga e responde
                // 500 genérico. Antes voltava como 400 com a mensagem do Prisma.
                throw e;
            }
        }
    }

    private registerOnce(input: {
        courseId: string;
        name: string;
        phone: string;
        email?: string | null;
        cpf: string;
        rg?: string;
        birthDate?: Date;
        address?: z.infer<typeof schema>['address'];
        hasAddress: boolean;
        maxCapacity: number;
    }): Promise<{
 registrationId: string;
userDataId: string;
personName: string 
}> {
        const { courseId, name, phone, email, cpf, rg, birthDate, address, hasAddress, maxCapacity } = input;
        return this.prisma.$transaction(async (tx: unknown) => {
            const t = tx as PrismaClient;
            // Primeiro a trava: em READ COMMITTED, tudo o que vem depois enxerga
            // as inscrições que acabaram de entrar.
            await lockCourseSeats(t, courseId);
            const userRepo = createUserDataAdapter(t);
            const addressRepo = createAddressAdapter(t);
            const propertyRepo = createPropertyAdapter(t);
            const registrationRepo = createRegistrationAdapter(t);

            // Dentro da transação: numa nova tentativa, acha a pessoa que outra
            // inscrição acabou de criar com o mesmo CPF.
            let userData = await userRepo.findByCpf(cpf);
            const personName = userData?.name ?? name;
            if (!userData) {
                userData = await userRepo.create({
                    name,
                    phone,
                    email: email ?? null,
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

            // Capacidade conferida com as vagas travadas → sem corrida TOCTOU
            // com inscrições concorrentes.
            const activeCount = await t.courseUserRegistration.count({
                where: { courseId,
isDeleted: false },
            });
            if (activeCount >= maxCapacity) throw new CourseFullError();

            const registration = await registrationRepo.create(courseId, userData.id);
            return { registrationId: registration.id,
userDataId: userData.id,
personName };
        });
    }
}

/** Erros esperados da inscrição (vão para o cliente); null = inesperado. */
function knownRegistrationError(e: unknown): Error | null {
    if (e instanceof CourseRegistrationAlreadyExistsError) return e;
    if (e instanceof CourseFullError) return e;
    const fields = uniqueViolationFields(e);
    // CPF primeiro: o índice "UserData_cpf_active_unique" também tem "active" no nome.
    if (fields.some(f => f.includes('cpf'))) return new CpfAlreadyInUseError();
    const isRegistrationDup = fields.some(
        f => f.includes('courseId') || f.includes('userDataId') || f.includes('active'),
    );
    if (isRegistrationDup) return new CourseRegistrationAlreadyExistsError();
    // Outra violação de unicidade: o único dado único da pessoa é o CPF
    // (outra inscrição criou o mesmo CPF ao mesmo tempo).
    if (isPrismaUniqueViolation(e)) return new CpfAlreadyInUseError();
    return null;
}
