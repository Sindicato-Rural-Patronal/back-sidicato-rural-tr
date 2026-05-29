import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { PrismaClient } from '@prisma/client/extension';
import { createRegistrationAdapter } from '../../adapter/database/registration-adapter.js';
import { createUserDataAdapter } from '../../adapter/database/user-data.js';
import { createUserAdminAdapter } from '../../adapter/database/user-admin-adapter.js';
import { createRuleAdapter } from '../../adapter/database/rule-adapter.js';
import { createCourseAdapter } from '../../adapter/database/course-adapter.js';
import { RegisterForCourseUseCase } from '../../usecase/register-for-course.js';
import { ListCourseRegistrationsUseCase } from '../../usecase/list-course-registrations.js';
import { CancelRegistrationUseCase } from '../../usecase/cancel-registration.js';
import { RegisterForCourseController } from '../controllers/register-for-course.js';
import { ListCourseRegistrationsController } from '../controllers/list-course-registrations.js';
import { CancelRegistrationController } from '../controllers/cancel-registration.js';

export async function registrationRouter(fastify: FastifyInstance, prisma: PrismaClient) {
    const courseRepository = createCourseAdapter(prisma);
    const userDataRepository = createUserDataAdapter(prisma);
    const userAdminRepository = createUserAdminAdapter(prisma);
    const ruleRepository = createRuleAdapter(prisma);
    const registrationRepository = createRegistrationAdapter(prisma);

    const registerController = new RegisterForCourseController(
        new RegisterForCourseUseCase(courseRepository, userDataRepository, registrationRepository),
    );
    const listController = new ListCourseRegistrationsController(
        new ListCourseRegistrationsUseCase(registrationRepository, userAdminRepository, ruleRepository),
    );
    const cancelController = new CancelRegistrationController(
        new CancelRegistrationUseCase(registrationRepository, userAdminRepository, ruleRepository),
    );

    fastify.post('/courses/:courseId/register', {
        schema: {
            tags: ['Registrations'],
            summary: 'Register for a course',
            description: 'Public. Looks up existing UserData by email or CPF — if found, associates the registration; otherwise creates a new record.',
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
                400: { type: 'object', properties: { error: { type: 'string' } } },
            },
        },
    }, (req: FastifyRequest<{ Params: { courseId: string }; Body: any }>, res: FastifyReply) =>
        registerController.handle(req, res),
    );

    const userDataProperties = {
        id: { type: 'string' },
        name: { type: 'string' },
        email: { type: 'string' },
        phone: { type: 'string' },
        cpf: { type: 'string', nullable: true },
        cnpj: { type: 'string', nullable: true },
        avatar: { type: 'string', nullable: true },
    };

    fastify.get('/admin/courses/:courseId/registrations', {
        schema: {
            tags: ['Admin — Registrations'],
            summary: 'List course registrations',
            security: [{ bearerAuth: [] }],
            params: {
                type: 'object',
                required: ['courseId'],
                properties: { courseId: { type: 'string' } },
            },
            response: {
                200: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'string' },
                            courseId: { type: 'string' },
                            userDataId: { type: 'string' },
                            createdAt: { type: 'string' },
                            userData: { type: 'object', properties: userDataProperties },
                        },
                    },
                },
                403: { type: 'object', properties: { error: { type: 'string' } } },
            },
        },
    }, (req: FastifyRequest<{ Params: { courseId: string } }>, res: FastifyReply) =>
        listController.handle(req, res),
    );

    fastify.delete('/admin/registrations/:registrationId', {
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
                403: { type: 'object', properties: { error: { type: 'string' } } },
                404: { type: 'object', properties: { error: { type: 'string' } } },
            },
        },
    }, (req: FastifyRequest<{ Params: { registrationId: string } }>, res: FastifyReply) =>
        cancelController.handle(req, res),
    );
}
