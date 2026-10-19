import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { createRegistrationAdapter } from '../../adapter/database/registration-adapter.js';
import { createUserDataAdapter } from '../../adapter/database/user-data.js';
import { createCourseAdapter } from '../../adapter/database/course-adapter.js';
import { createNotificationPublisher } from '../../adapter/database/notification-adapter.js';
import { RegisterForCourseByCpfUseCase } from '../../usecase/register-for-course-by-cpf.js';
import { RegisterForCourseFullUseCase } from '../../usecase/register-for-course-full.js';
import { LookupUserByCpfUseCase } from '../../usecase/lookup-user-by-cpf.js';
import { ListCourseRegistrationsUseCase } from '../../usecase/list-course-registrations.js';
import { CancelRegistrationUseCase } from '../../usecase/cancel-registration.js';
import { SetRegistrationConfirmedUseCase } from '../../usecase/set-registration-confirmed.js';
import { StartCourseUseCase } from '../../usecase/start-course.js';
import { UploadRegistrationFichaUseCase } from '../../usecase/upload-registration-ficha.js';
import { GetRegistrationFichaUseCase } from '../../usecase/get-registration-ficha.js';
import { DeleteRegistrationFichaUseCase } from '../../usecase/delete-registration-ficha.js';
import { RegisterForCourseByCpfController } from '../controllers/register-for-course-by-cpf.js';
import { RegisterForCourseFullController } from '../controllers/register-for-course-full.js';
import { LookupUserByCpfController } from '../controllers/lookup-user-by-cpf.js';
import { ListCourseRegistrationsController } from '../controllers/list-course-registrations.js';
import { CancelRegistrationController } from '../controllers/cancel-registration.js';
import { SetRegistrationConfirmedController } from '../controllers/set-registration-confirmed.js';
import { StartCourseController } from '../controllers/start-course.js';
import { UploadRegistrationFichaController } from '../controllers/upload-registration-ficha.js';
import { DownloadRegistrationFichaController } from '../controllers/download-registration-ficha.js';
import { DeleteRegistrationFichaController } from '../controllers/delete-registration-ficha.js';
import {
    AdminRegisterPersonUseCase,
    ConfirmAllRegistrationsUseCase,
} from '../../usecase/admin-course-registrations.js';
import {
    AdminRegisterPersonController,
    ConfirmAllRegistrationsController,
} from '../controllers/admin-course-registrations.js';
import { CompleteCourseUseCase } from '../../usecase/complete-course.js';
import { CompleteCourseController } from '../controllers/complete-course.js';
import {
    SetRegistrationAttendanceUseCase,
    SetUnmarkedAttendanceUseCase,
} from '../../usecase/course-attendance.js';
import {
    SetRegistrationAttendanceController,
    SetUnmarkedAttendanceController,
} from '../controllers/course-attendance.js';
import { errorResponse, paginationQuerystring, pagedResponse } from '../lib/swagger-schemas.js';
import { publicFormRateLimit, publicLookupRateLimit } from '../lib/public-rate-limit.js';
import { CpfAttemptLimiter } from '../../lib/cpf-attempt-limiter.js';
import { publicRoute, requires } from '../lib/route-auth.js';

export async function registrationRouter(fastify: FastifyInstance, prisma: PrismaClient) {
    const courseRepository = createCourseAdapter(prisma);
    const userDataRepository = createUserDataAdapter(prisma);
    const registrationRepository = createRegistrationAdapter(prisma);
    const notifications = createNotificationPublisher(prisma);
    // Um contador só para a consulta e as duas inscrições por CPF: errar numa
    // gasta as tentativas das outras.
    const cpfAttempts = new CpfAttemptLimiter();

    const registerByCpfController = new RegisterForCourseByCpfController(
        new RegisterForCourseByCpfUseCase(courseRepository, userDataRepository, registrationRepository, notifications, cpfAttempts),
    );
    const registerFullController = new RegisterForCourseFullController(
        new RegisterForCourseFullUseCase(prisma, notifications, cpfAttempts),
    );
    const lookupByCpfController = new LookupUserByCpfController(
        new LookupUserByCpfUseCase(userDataRepository, cpfAttempts),
    );
    const listController = new ListCourseRegistrationsController(
        new ListCourseRegistrationsUseCase(registrationRepository),
    );
    const cancelController = new CancelRegistrationController(
        new CancelRegistrationUseCase(registrationRepository),
    );
    const setConfirmedController = new SetRegistrationConfirmedController(
        new SetRegistrationConfirmedUseCase(registrationRepository),
    );
    const startCourseController = new StartCourseController(
        new StartCourseUseCase(courseRepository, registrationRepository),
    );
    const uploadFichaController = new UploadRegistrationFichaController(
        new UploadRegistrationFichaUseCase(registrationRepository),
    );
    const downloadFichaController = new DownloadRegistrationFichaController(
        new GetRegistrationFichaUseCase(registrationRepository),
    );
    const deleteFichaController = new DeleteRegistrationFichaController(
        new DeleteRegistrationFichaUseCase(registrationRepository),
    );
    const adminRegisterController = new AdminRegisterPersonController(
        new AdminRegisterPersonUseCase(courseRepository, userDataRepository, registrationRepository),
    );
    const confirmAllController = new ConfirmAllRegistrationsController(
        new ConfirmAllRegistrationsUseCase(courseRepository, registrationRepository),
    );
    const completeCourseController = new CompleteCourseController(
        new CompleteCourseUseCase(courseRepository),
    );
    const setAttendanceController = new SetRegistrationAttendanceController(
        new SetRegistrationAttendanceUseCase(registrationRepository),
    );
    const setUnmarkedAttendanceController = new SetUnmarkedAttendanceController(
        new SetUnmarkedAttendanceUseCase(courseRepository, registrationRepository),
    );

    fastify.post(
        '/courses/:courseId/register-by-cpf',
        {
            config: { ...publicFormRateLimit,
auth: publicRoute() },
            schema: {
                tags: ['Registrations'],
                summary: 'Register for a course with CPF and the last 4 phone digits',
                description:
                    'Pública. Inscreve quem já tem cadastro: o CPF e os 4 últimos dígitos de um dos telefones do cadastro (só dígitos; máscara e DDI 55 não contam). CPF sem cadastro **e** telefone que não confere dão o mesmo 404 "Não encontramos cadastro com este CPF e telefone." (o site segue para o `register-full`). 5 erros na hora para o mesmo CPF (somando consulta e inscrições) → 429. `phoneEnd` sem 4 dígitos → 400.',
                params: {
                    type: 'object',
                    required: ['courseId'],
                    properties: { courseId: { type: 'string' } },
                },
                body: {
                    type: 'object',
                    required: ['cpf', 'phoneEnd'],
                    properties: {
                        cpf: { type: 'string',
example: '52998224725' },
                        phoneEnd: { type: 'string',
description: 'Os 4 últimos dígitos do telefone',
example: '0001' },
                    },
                },
                response: {
                    201: {
                        type: 'object',
                        properties: {
                            registrationId: { type: 'string' },
                            userDataId: { type: 'string' },
                        },
                    },
                    400: errorResponse,
                    404: errorResponse,
                    409: errorResponse,
                    429: errorResponse,
                },
            },
        },
        (
            req: FastifyRequest<{
 Params: { courseId: string };
Body: {
 cpf: string;
phoneEnd: string 
}
}>,
            res: FastifyReply,
        ) => registerByCpfController.handle(req, res),
    );

    fastify.post(
        '/users/lookup-cpf',
        {
            config: { ...publicLookupRateLimit,
auth: publicRoute() },
            schema: {
                tags: ['Registrations'],
                summary: 'Look up a participant by CPF and the last 4 phone digits',
                description:
                    'Pública. POST para o CPF não ir na URL (nem nos logs). Com o CPF e os 4 últimos dígitos de um dos telefones do cadastro, devolve `{ found: true, name }` com o nome mascarado ("João D. S."). CPF inválido, sem cadastro ou telefone que não confere: o mesmo `{ found: false, name: null }`. 5 erros na hora para o mesmo CPF (somando consulta e inscrições) → 429. `phoneEnd` sem 4 dígitos → 400. Não inscreve.',
                body: {
                    type: 'object',
                    required: ['cpf', 'phoneEnd'],
                    properties: {
                        cpf: { type: 'string',
example: '52998224725' },
                        phoneEnd: { type: 'string',
description: 'Os 4 últimos dígitos do telefone',
example: '0001' },
                    },
                },
                response: {
                    200: {
                        type: 'object',
                        properties: {
                            found: { type: 'boolean' },
                            name: { type: 'string',
nullable: true },
                        },
                    },
                    400: errorResponse,
                    429: errorResponse,
                },
            },
        },
        (req: FastifyRequest<{
 Body: {
 cpf: string;
phoneEnd: string 
} 
}>, res: FastifyReply) =>
            lookupByCpfController.handle(req, res),
    );

    fastify.post(
        '/courses/:courseId/register-full',
        {
            config: { ...publicFormRateLimit,
auth: publicRoute() },
            schema: {
                tags: ['Registrations'],
                summary: 'Register a new participant with full data',
                description:
                    'Pública. CPF sem cadastro: cria a pessoa (com rg, nascimento e o endereço como propriedade principal) e inscreve. CPF que já tem cadastro: só inscreve se `phone` for um dos três telefones do cadastro (últimos 8 dígitos; máscara e DDI 55 não contam); senão, ou se o cadastro não tem telefone, nada é vinculado nem alterado → 409 "Não foi possível confirmar seu cadastro pelo site. Procure o Sindicato para fazer a inscrição.". O cadastro existente nunca é sobrescrito. E-mail é opcional. 5 erros na hora para o mesmo CPF → 429.',
                params: {
                    type: 'object',
                    required: ['courseId'],
                    properties: { courseId: { type: 'string' } },
                },
                body: {
                    type: 'object',
                    required: ['name', 'phone', 'cpf'],
                    properties: {
                        name: { type: 'string' },
                        phone: { type: 'string' },
                        email: { type: 'string',
nullable: true },
                        cpf: { type: 'string' },
                        rg: { type: 'string' },
                        birthDate: { type: 'string' },
                        address: {
                            type: 'object',
                            properties: {
                                type: { type: 'string',
enum: ['URBAN', 'RURAL'] },
                                zipCode: { type: 'string' },
                                street: { type: 'string' },
                                number: { type: 'string' },
                                neighborhood: { type: 'string' },
                                city: { type: 'string' },
                                state: { type: 'string' },
                                road: { type: 'string' },
                                km: { type: 'string' },
                            },
                        },
                    },
                },
                response: {
                    201: {
                        type: 'object',
                        properties: {
                            registrationId: { type: 'string' },
                            userDataId: { type: 'string' },
                        },
                    },
                    400: errorResponse,
                    404: errorResponse,
                    409: errorResponse,
                    429: errorResponse,
                },
            },
        },
        (
            req: FastifyRequest<{
                Params: { courseId: string };
                Body: Parameters<typeof registerFullController.handle>[0]['body'];
            }>,
            res: FastifyReply,
        ) => registerFullController.handle(req, res),
    );

    const userDataProperties = {
        id: { type: 'string' },
        name: { type: 'string' },
        email: { type: 'string',
nullable: true },
        phone: { type: 'string' },
        cpf: { type: 'string',
nullable: true },
        avatar: { type: 'string',
nullable: true },
        birthDate: { type: 'string',
nullable: true },
        boardMember: { type: 'boolean' },
        boardPosition: { type: 'string',
nullable: true },
        memberStatus: { type: 'string',
nullable: true },
        membershipValidUntil: { type: 'string',
nullable: true },
        publicContact: { type: 'object',
nullable: true,
properties: { title: { type: 'string',
nullable: true } } },
        companyMemberships: {
            type: 'array',
            description: 'Vínculos com empresas parceiras ativas',
            items: {
                type: 'object',
                properties: { company: { type: 'object',
properties: { name: { type: 'string' },
tradeName: { type: 'string',
nullable: true } } } },
            },
        },
    };

    fastify.get(
        '/admin/courses/:courseId/registrations',
        {
            config: { auth: requires('READ_COURSE') },
            schema: {
                tags: ['Admin — Registrations'],
                summary: 'List course registrations',
                security: [{ bearerAuth: [] }],
                params: {
                    type: 'object',
                    required: ['courseId'],
                    properties: { courseId: { type: 'string' } },
                },
                querystring: paginationQuerystring,
                response: {
                    200: pagedResponse({
                                    type: 'object',
                                    properties: {
                                        id: { type: 'string' },
                                        courseId: { type: 'string' },
                                        userDataId: { type: 'string' },
                                        confirmed: { type: 'boolean' },
                                        attended: {
                                            type: 'boolean',
                                            nullable: true,
                                            description: 'Presença: true presente, false faltou, null sem marcar',
                                        },
                                        createdAt: { type: 'string' },
                                        userData: { type: 'object',
properties: userDataProperties },
                                        ficha: {
                                            type: 'object',
                                            nullable: true,
                                            properties: {
                                                id: { type: 'string' },
                                                filename: { type: 'string' },
                                                createdAt: { type: 'string' },
                                            },
                                        },
                                    },
                                }),
                    401: errorResponse,
                    403: errorResponse,
                    404: errorResponse,
                },
            },
        },
        (
            req: FastifyRequest<{
                Params: { courseId: string };
                Querystring: {
 page?: number;
limit?: number 
};
            }>,
            res: FastifyReply,
        ) => listController.handle(req, res),
    );

    fastify.post(
        '/admin/courses/:courseId/registrations',
        {
            config: { auth: requires('UPDATE_COURSE') },
            schema: {
                tags: ['Admin — Registrations'],
                summary: 'Register a person from the admin panel',
                description:
                    'Inscreve uma pessoa já cadastrada. Ignora prazo, status e data de término do curso; só respeita a lotação da sala. A inscrição já nasce confirmada. Pessoa já inscrita → 409; curso lotado → 409.',
                security: [{ bearerAuth: [] }],
                params: {
                    type: 'object',
                    required: ['courseId'],
                    properties: { courseId: { type: 'string' } },
                },
                body: {
                    type: 'object',
                    required: ['userDataId'],
                    properties: { userDataId: { type: 'string' } },
                },
                response: {
                    201: { type: 'object',
properties: { registrationId: { type: 'string' } } },
                    400: errorResponse,
                    401: errorResponse,
                    403: errorResponse,
                    404: errorResponse,
                    409: errorResponse,
                },
            },
        },
        (
            req: FastifyRequest<{
                Params: { courseId: string };
                Body: { userDataId: string };
            }>,
            res: FastifyReply,
        ) => adminRegisterController.handle(req, res),
    );

    fastify.patch(
        '/admin/courses/:courseId/registrations/confirm-all',
        {
            config: { auth: requires('UPDATE_COURSE') },
            schema: {
                tags: ['Admin — Registrations'],
                summary: 'Confirm all unconfirmed registrations of a course',
                description: 'Retorna `confirmed`: quantas inscrições foram confirmadas agora.',
                security: [{ bearerAuth: [] }],
                params: {
                    type: 'object',
                    required: ['courseId'],
                    properties: { courseId: { type: 'string' } },
                },
                response: {
                    200: { type: 'object',
properties: { confirmed: { type: 'integer' } } },
                    401: errorResponse,
                    403: errorResponse,
                    404: errorResponse,
                },
            },
        },
        (req: FastifyRequest<{ Params: { courseId: string } }>, res: FastifyReply) =>
            confirmAllController.handle(req, res),
    );

    fastify.delete(
        '/admin/registrations/:registrationId',
        {
            config: { auth: requires('UPDATE_COURSE') },
            schema: {
                tags: ['Admin — Registrations'],
                summary: 'Cancel registration',
                security: [{ bearerAuth: [] }],
                params: {
                    type: 'object',
                    required: ['registrationId'],
                    properties: { registrationId: { type: 'string' } },
                },
                response: {
                    204: { type: 'null' },
                    401: errorResponse,
                    403: errorResponse,
                    404: errorResponse,
                },
            },
        },
        (req: FastifyRequest<{ Params: { registrationId: string } }>, res: FastifyReply) =>
            cancelController.handle(req, res),
    );

    fastify.patch(
        '/admin/registrations/:registrationId/confirm',
        {
            config: { auth: requires('UPDATE_COURSE') },
            schema: {
                tags: ['Admin — Registrations'],
                summary: 'Confirm or unconfirm a registration',
                security: [{ bearerAuth: [] }],
                params: {
                    type: 'object',
                    required: ['registrationId'],
                    properties: { registrationId: { type: 'string' } },
                },
                body: {
                    type: 'object',
                    required: ['confirmed'],
                    properties: { confirmed: { type: 'boolean' } },
                },
                response: {
                    200: { type: 'object',
properties: { message: { type: 'string' } } },
                    401: errorResponse,
                    403: errorResponse,
                    404: errorResponse,
                },
            },
        },
        (
            req: FastifyRequest<{
 Params: { registrationId: string };
Body: { confirmed: boolean } 
}>,
            res: FastifyReply,
        ) => setConfirmedController.handle(req, res),
    );

    fastify.post(
        '/admin/courses/:courseId/start',
        {
            config: { auth: requires('UPDATE_COURSE') },
            schema: {
                tags: ['Admin — Registrations'],
                summary: 'Start the course',
                description:
                    'Sets the course status to IN_PROGRESS. Fails (400) only if there are no registrations; unconfirmed registrations do not block.',
                security: [{ bearerAuth: [] }],
                params: {
                    type: 'object',
                    required: ['courseId'],
                    properties: { courseId: { type: 'string' } },
                },
                response: {
                    200: { type: 'object',
properties: { message: { type: 'string' } } },
                    400: errorResponse,
                    401: errorResponse,
                    403: errorResponse,
                    404: errorResponse,
                },
            },
        },
        (req: FastifyRequest<{ Params: { courseId: string } }>, res: FastifyReply) =>
            startCourseController.handle(req, res),
    );

    fastify.patch(
        '/admin/courses/:courseId/complete',
        {
            config: { auth: requires('UPDATE_COURSE') },
            schema: {
                tags: ['Admin — Courses'],
                summary: 'Mark the course as completed',
                description:
                    'Manual. Only from IN_PROGRESS (other status → 409). Sets the status to COMPLETED: the course stays out of the public list, its page still opens by link and it never accepts registrations.',
                security: [{ bearerAuth: [] }],
                params: {
                    type: 'object',
                    required: ['courseId'],
                    properties: { courseId: { type: 'string' } },
                },
                response: {
                    200: {
                        type: 'object',
                        properties: {
                            id: { type: 'string' },
                            status: { type: 'string',
enum: ['COMPLETED'] },
                        },
                    },
                    401: errorResponse,
                    403: errorResponse,
                    404: errorResponse,
                    409: errorResponse,
                },
            },
        },
        (req: FastifyRequest<{ Params: { courseId: string } }>, res: FastifyReply) =>
            completeCourseController.handle(req, res),
    );

    fastify.patch(
        '/admin/registrations/:registrationId/attendance',
        {
            config: { auth: requires('UPDATE_COURSE') },
            schema: {
                tags: ['Admin — Registrations'],
                summary: 'Mark attendance of a registration',
                description: '`attended`: true = presente, false = faltou, null = desmarcar.',
                security: [{ bearerAuth: [] }],
                params: {
                    type: 'object',
                    required: ['registrationId'],
                    properties: { registrationId: { type: 'string' } },
                },
                body: {
                    type: 'object',
                    required: ['attended'],
                    properties: { attended: { type: 'boolean',
nullable: true } },
                },
                response: {
                    200: {
                        type: 'object',
                        properties: {
                            id: { type: 'string' },
                            attended: { type: 'boolean',
nullable: true },
                        },
                    },
                    400: errorResponse,
                    401: errorResponse,
                    403: errorResponse,
                    404: errorResponse,
                },
            },
        },
        (
            req: FastifyRequest<{
                Params: { registrationId: string };
                Body: { attended: boolean | null };
            }>,
            res: FastifyReply,
        ) => setAttendanceController.handle(req, res),
    );

    fastify.patch(
        '/admin/courses/:courseId/registrations/attendance',
        {
            config: { auth: requires('UPDATE_COURSE') },
            schema: {
                tags: ['Admin — Registrations'],
                summary: 'Mark attendance of every unmarked confirmed registration',
                description:
                    'Sets `attended` on every confirmed, active registration of the course that is still unmarked (null). Already marked and unconfirmed registrations are left as they are. Returns `updated`: how many changed.',
                security: [{ bearerAuth: [] }],
                params: {
                    type: 'object',
                    required: ['courseId'],
                    properties: { courseId: { type: 'string' } },
                },
                body: {
                    type: 'object',
                    required: ['attended'],
                    // nullable: sem isso o ajv converte null em false (marcaria faltas);
                    // o use case recusa null com 400.
                    properties: { attended: { type: 'boolean',
nullable: true } },
                },
                response: {
                    200: { type: 'object',
properties: { updated: { type: 'integer' } } },
                    400: errorResponse,
                    401: errorResponse,
                    403: errorResponse,
                    404: errorResponse,
                },
            },
        },
        (
            req: FastifyRequest<{
                Params: { courseId: string };
                Body: { attended: boolean };
            }>,
            res: FastifyReply,
        ) => setUnmarkedAttendanceController.handle(req, res),
    );

    fastify.post(
        '/admin/registrations/:registrationId/ficha',
        {
            config: { auth: requires('UPDATE_COURSE') },
            schema: {
                tags: ['Admin — Registrations'],
                summary: 'Attach the filled/scanned enrollment form (PDF)',
                description:
                    'Envie como multipart/form-data com o PDF no campo "file". Máx 15MB. Substitui a ficha anterior, se houver.',
                security: [{ bearerAuth: [] }],
                consumes: ['multipart/form-data'],
                params: {
                    type: 'object',
                    required: ['registrationId'],
                    properties: { registrationId: { type: 'string' } },
                },
                response: {
                    201: { type: 'object',
properties: { filename: { type: 'string' } } },
                    400: errorResponse,
                    401: errorResponse,
                    403: errorResponse,
                    404: errorResponse,
                },
            },
        },
        (req: FastifyRequest<{ Params: { registrationId: string } }>, res: FastifyReply) =>
            uploadFichaController.handle(req, res),
    );

    fastify.get(
        '/admin/registrations/:registrationId/ficha',
        {
            config: { auth: requires('READ_COURSE') },
            schema: {
                tags: ['Admin — Registrations'],
                summary: 'Download the attached enrollment form (PDF)',
                description: 'Retorna o PDF anexado (inline). Requer READ_COURSE (mesma permissão de ver as inscrições).',
                security: [{ bearerAuth: [] }],
                params: {
                    type: 'object',
                    required: ['registrationId'],
                    properties: { registrationId: { type: 'string' } },
                },
                response: {
                    401: errorResponse,
                    404: errorResponse,
                },
            },
        },
        (req: FastifyRequest<{ Params: { registrationId: string } }>, res: FastifyReply) =>
            downloadFichaController.handle(req, res),
    );

    fastify.delete(
        '/admin/registrations/:registrationId/ficha',
        {
            config: { auth: requires('UPDATE_COURSE') },
            schema: {
                tags: ['Admin — Registrations'],
                summary: 'Remove the attached enrollment form',
                security: [{ bearerAuth: [] }],
                params: {
                    type: 'object',
                    required: ['registrationId'],
                    properties: { registrationId: { type: 'string' } },
                },
                response: {
                    204: { type: 'null' },
                    401: errorResponse,
                    403: errorResponse,
                    404: errorResponse,
                },
            },
        },
        (req: FastifyRequest<{ Params: { registrationId: string } }>, res: FastifyReply) =>
            deleteFichaController.handle(req, res),
    );
}
