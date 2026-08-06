import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client/extension';
import { createRegistrationAdapter } from '../../adapter/database/registration-adapter.js';
import { createUserDataAdapter } from '../../adapter/database/user-data.js';
import { createUserAdminAdapter } from '../../adapter/database/user-admin-adapter.js';
import { createRuleAdapter } from '../../adapter/database/rule-adapter.js';
import { createCourseAdapter } from '../../adapter/database/course-adapter.js';
import { createPropertyAdapter } from '../../adapter/database/property-adapter.js';
import { createAddressAdapter } from '../../adapter/database/address-adapter.js';
import { RegisterForCourseUseCase } from '../../usecase/register-for-course.js';
import { RegisterForCourseByCpfUseCase } from '../../usecase/register-for-course-by-cpf.js';
import { RegisterForCourseFullUseCase } from '../../usecase/register-for-course-full.js';
import { LookupUserByCpfUseCase } from '../../usecase/lookup-user-by-cpf.js';
import { ListCourseRegistrationsUseCase } from '../../usecase/list-course-registrations.js';
import { CancelRegistrationUseCase } from '../../usecase/cancel-registration.js';
import { RegisterForCourseController } from '../controllers/register-for-course.js';
import { RegisterForCourseByCpfController } from '../controllers/register-for-course-by-cpf.js';
import { RegisterForCourseFullController } from '../controllers/register-for-course-full.js';
import { LookupUserByCpfController } from '../controllers/lookup-user-by-cpf.js';
import { ListCourseRegistrationsController } from '../controllers/list-course-registrations.js';
import { CancelRegistrationController } from '../controllers/cancel-registration.js';
import { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { errorResponse, paginationQuerystring, pagedResponse } from '../lib/swagger-schemas.js';

export async function registrationRouter(fastify: FastifyInstance, prisma: PrismaClient) {
    const courseRepository = createCourseAdapter(prisma);
    const userDataRepository = createUserDataAdapter(prisma);
    const userAdminRepository = createUserAdminAdapter(prisma);
    const ruleRepository = createRuleAdapter(prisma);
    const registrationRepository = createRegistrationAdapter(prisma);
    const propertyRepository = createPropertyAdapter(prisma);
    const addressRepository = createAddressAdapter(prisma);
    const getAdminPermissions = new GetAdminPermissionsUseCase(userAdminRepository, ruleRepository);

    const registerController = new RegisterForCourseController(
        new RegisterForCourseUseCase(courseRepository, userDataRepository, registrationRepository),
    );
    const registerByCpfController = new RegisterForCourseByCpfController(
        new RegisterForCourseByCpfUseCase(courseRepository, userDataRepository, registrationRepository),
    );
    const registerFullController = new RegisterForCourseFullController(
        new RegisterForCourseFullUseCase(
            courseRepository,
            userDataRepository,
            registrationRepository,
            propertyRepository,
            addressRepository,
        ),
    );
    const lookupByCpfController = new LookupUserByCpfController(
        new LookupUserByCpfUseCase(userDataRepository),
    );
    const listController = new ListCourseRegistrationsController(
        new ListCourseRegistrationsUseCase(registrationRepository),
        getAdminPermissions,
    );
    const cancelController = new CancelRegistrationController(
        new CancelRegistrationUseCase(registrationRepository),
        getAdminPermissions,
    );

    fastify.post(
        '/courses/:courseId/register',
        {
            schema: {
                tags: ['Registrations'],
                summary: 'Register for a course',
                description:
                    'Public. Looks up existing UserData by email or CPF — if found, associates the registration; otherwise creates a new record.',
                params: {
                    type: 'object',
                    required: ['courseId'],
                    properties: { courseId: { type: 'string' } },
                },
                body: {
                    type: 'object',
                    required: ['name', 'phone', 'email', 'cpf'],
                    properties: {
                        name: { type: 'string',
example: 'João da Silva' },
                        phone: { type: 'string',
example: '44999990001' },
                        email: { type: 'string',
format: 'email',
example: 'joao@example.com' },
                        cpf: { type: 'string',
example: '52998224725' },
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
                },
            },
        },
        (
            req: FastifyRequest<{
                Params: { courseId: string };
                Body: {
                    name: string;
                    phone: string;
                    email: string;
                    cpf: string;
                };
            }>,
            res: FastifyReply,
        ) => registerController.handle(req, res),
    );

    fastify.post(
        '/courses/:courseId/register-by-cpf',
        {
            schema: {
                tags: ['Registrations'],
                summary: 'Register for a course by CPF only',
                description:
                    'Public. Looks up existing UserData by CPF — if found, registers for the course; if not found, returns 404 so the client can redirect to the full registration flow.',
                params: {
                    type: 'object',
                    required: ['courseId'],
                    properties: { courseId: { type: 'string' } },
                },
                body: {
                    type: 'object',
                    required: ['cpf'],
                    properties: {
                        cpf: { type: 'string',
example: '52998224725' },
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
                },
            },
        },
        (
            req: FastifyRequest<{
 Params: { courseId: string };
Body: { cpf: string } 
}>,
            res: FastifyReply,
        ) => registerByCpfController.handle(req, res),
    );

    fastify.get(
        '/users/lookup-cpf/:cpf',
        {
            schema: {
                tags: ['Registrations'],
                summary: 'Look up a participant by CPF',
                description:
                    'Public. Returns whether a UserData exists for the CPF and a masked name to confirm identity. Does not register.',
                params: {
                    type: 'object',
                    required: ['cpf'],
                    properties: { cpf: { type: 'string' } },
                },
                response: {
                    200: {
                        type: 'object',
                        properties: {
                            found: { type: 'boolean' },
                            name: { type: 'string', nullable: true },
                        },
                    },
                },
            },
        },
        (req: FastifyRequest<{ Params: { cpf: string } }>, res: FastifyReply) =>
            lookupByCpfController.handle(req, res),
    );

    fastify.post(
        '/courses/:courseId/register-full',
        {
            schema: {
                tags: ['Registrations'],
                summary: 'Register a new participant with full data',
                description:
                    'Public. Creates the participant (with rg/birthDate and address as their primary property) and registers for the course. If a UserData already exists for the email/CPF, only registers.',
                params: {
                    type: 'object',
                    required: ['courseId'],
                    properties: { courseId: { type: 'string' } },
                },
                body: {
                    type: 'object',
                    required: ['name', 'phone', 'email', 'cpf'],
                    properties: {
                        name: { type: 'string' },
                        phone: { type: 'string' },
                        email: { type: 'string', format: 'email' },
                        cpf: { type: 'string' },
                        rg: { type: 'string' },
                        birthDate: { type: 'string' },
                        address: {
                            type: 'object',
                            properties: {
                                type: { type: 'string', enum: ['URBAN', 'RURAL'] },
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
        email: { type: 'string' },
        phone: { type: 'string' },
        cpf: { type: 'string',
nullable: true },
        cnpj: { type: 'string',
nullable: true },
        avatar: { type: 'string',
nullable: true },
    };

    fastify.get(
        '/admin/courses/:courseId/registrations',
        {
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
                                        createdAt: { type: 'string' },
                                        userData: { type: 'object',
properties: userDataProperties },
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

    fastify.delete(
        '/admin/registrations/:registrationId',
        {
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
}
