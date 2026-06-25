import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client/extension';
import { createRegistrationAdapter } from '../../adapter/database/registration-adapter.js';
import { createUserDataAdapter } from '../../adapter/database/user-data.js';
import { createUserAdminAdapter } from '../../adapter/database/user-admin-adapter.js';
import { createRuleAdapter } from '../../adapter/database/rule-adapter.js';
import { createCourseAdapter } from '../../adapter/database/course-adapter.js';
import { RegisterForCourseUseCase } from '../../usecase/register-for-course.js';
import { RegisterForCourseByCpfUseCase } from '../../usecase/register-for-course-by-cpf.js';
import { ListCourseRegistrationsUseCase } from '../../usecase/list-course-registrations.js';
import { CancelRegistrationUseCase } from '../../usecase/cancel-registration.js';
import { RegisterForCourseController } from '../controllers/register-for-course.js';
import { RegisterForCourseByCpfController } from '../controllers/register-for-course-by-cpf.js';
import { ListCourseRegistrationsController } from '../controllers/list-course-registrations.js';
import { CancelRegistrationController } from '../controllers/cancel-registration.js';
import { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';

export async function registrationRouter(fastify: FastifyInstance, prisma: PrismaClient) {
    const courseRepository = createCourseAdapter(prisma);
    const userDataRepository = createUserDataAdapter(prisma);
    const userAdminRepository = createUserAdminAdapter(prisma);
    const ruleRepository = createRuleAdapter(prisma);
    const registrationRepository = createRegistrationAdapter(prisma);
    const getAdminPermissions = new GetAdminPermissionsUseCase(userAdminRepository, ruleRepository);

    const registerController = new RegisterForCourseController(
        new RegisterForCourseUseCase(courseRepository, userDataRepository, registrationRepository),
    );
    const registerByCpfController = new RegisterForCourseByCpfController(
        new RegisterForCourseByCpfUseCase(courseRepository, userDataRepository, registrationRepository),
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
                    400: { type: 'object',
properties: { error: { type: 'string' } } },
                    404: { type: 'object',
properties: { error: { type: 'string' } } },
                    409: { type: 'object',
properties: { error: { type: 'string' } } },
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
                    400: { type: 'object',
properties: { error: { type: 'string' } } },
                    404: { type: 'object',
properties: { error: { type: 'string' } } },
                    409: { type: 'object',
properties: { error: { type: 'string' } } },
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
                querystring: {
                    type: 'object',
                    properties: {
                        page: { type: 'integer',
minimum: 1,
default: 1 },
                        limit: { type: 'integer',
minimum: 1,
maximum: 1000,
default: 20 },
                    },
                },
                response: {
                    200: {
                        type: 'object',
                        properties: {
                            data: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        id: { type: 'string' },
                                        courseId: { type: 'string' },
                                        userDataId: { type: 'string' },
                                        createdAt: { type: 'string' },
                                        userData: { type: 'object',
properties: userDataProperties },
                                    },
                                },
                            },
                            total: { type: 'integer' },
                            page: { type: 'integer' },
                            limit: { type: 'integer' },
                            totalPages: { type: 'integer' },
                        },
                    },
                    401: { type: 'object',
properties: { error: { type: 'string' } } },
                    403: { type: 'object',
properties: { error: { type: 'string' } } },
                    404: { type: 'object',
properties: { error: { type: 'string' } } },
                },
            },
        },
        (req: FastifyRequest<{ Params: { courseId: string } }>, res: FastifyReply) =>
            listController.handle(req, res),
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
                    401: { type: 'object',
properties: { error: { type: 'string' } } },
                    403: { type: 'object',
properties: { error: { type: 'string' } } },
                    404: { type: 'object',
properties: { error: { type: 'string' } } },
                },
            },
        },
        (req: FastifyRequest<{ Params: { registrationId: string } }>, res: FastifyReply) =>
            cancelController.handle(req, res),
    );
}
